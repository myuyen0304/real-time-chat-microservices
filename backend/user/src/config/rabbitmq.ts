import amqp from "amqplib";
import { userEnv } from "./env.js";

let channel: amqp.Channel;

export const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect({
      protocol: "amqp",
      hostname: userEnv.Rabbitmq_Host,
      port: 5672,
      username: userEnv.Rabbitmq_Username,
      password: userEnv.Rabbitmq_Password,
    });
    channel = await connection.createChannel();
    console.log("Connected to RabbitMQ");
  } catch (error) {
    console.error("Fail to connect to RabbitMQ");
    throw error;
  }
};
export const publishToQueue = async (queueName: string, message: any) => {
  if (!channel) {
    console.log("Rabbitmq channel is not initialized");
    return;
  }
  await channel.assertQueue(queueName, { durable: true });
  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
    persistent: true,
  });
};
