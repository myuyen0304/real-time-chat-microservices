import amqp from "amqplib";
import { UserSnapshot } from "../model/UserSnapshot.js";

export const startUserEventsConsumer = async () => {
  try {
    const connection = await amqp.connect({
      protocol: "amqp",
      hostname: process.env.Rabbitmq_Host,
      port: 5672,
      username: process.env.Rabbitmq_Username,
      password: process.env.Rabbitmq_Password,
    });

    const channel = await connection.createChannel();
    const queueName = "user.events";
    await channel.assertQueue(queueName, { durable: true });
    console.log("Chat service: listening for user events");

    channel.consume(queueName, async (msg) => {
      if (!msg) return;
      try {
        const { type, payload } = JSON.parse(msg.content.toString());
        if (type === "user.upserted") {
          await UserSnapshot.findByIdAndUpdate(
            payload._id,
            { name: payload.name, email: payload.email },
            { upsert: true, new: true }
          );
          console.log(`UserSnapshot synced: ${payload.email}`);
        }
        channel.ack(msg);
      } catch (error) {
        console.error("Failed to process user event", error);
        channel.nack(msg, false, false);
      }
    });
  } catch (error) {
    console.error("Failed to start user events consumer", error);
  }
};
