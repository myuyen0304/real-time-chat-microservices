import amqp from "amqplib";
import { UserSnapshot } from "../model/UserSnapshot.js";
import { chatEnv } from "./env.js";

const RABBITMQ_RETRY_DELAY_MS = 3000;

const waitForRetry = async () => {
  await new Promise((resolve) => setTimeout(resolve, RABBITMQ_RETRY_DELAY_MS));
};

export const startUserEventsConsumer = async () => {
  while (true) {
    try {
      const connection = await amqp.connect({
        protocol: "amqp",
        hostname: chatEnv.Rabbitmq_Host,
        port: 5672,
        username: chatEnv.Rabbitmq_Username,
        password: chatEnv.Rabbitmq_Password,
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
              { upsert: true, new: true },
            );
            console.log(`UserSnapshot synced: ${payload.email}`);
          }
          channel.ack(msg);
        } catch (error) {
          console.error("Failed to process user event", error);
          channel.nack(msg, false, false);
        }
      });

      return;
    } catch (error) {
      console.error(
        "Failed to start user events consumer, retrying in 3 seconds",
        error,
      );
      await waitForRetry();
    }
  }
};
