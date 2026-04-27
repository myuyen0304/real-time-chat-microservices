import amqp from "amqplib";
import { userEnv } from "./env.js";

let channel: amqp.Channel;

const RABBITMQ_RETRY_DELAY_MS = 3000;

const waitForRetry = async () => {
  await new Promise((resolve) => setTimeout(resolve, RABBITMQ_RETRY_DELAY_MS));
};

export const connectRabbitMQ = async () => {
  while (!channel) {
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
      return;
    } catch (error) {
      console.error(
        "Fail to connect to RabbitMQ, retrying in 3 seconds",
        error,
      );
      await waitForRetry();
    }
  }
};

const createRabbitMQUnavailableError = () => {
  const error = new Error("RabbitMQ channel is not initialized") as Error & {
    statusCode: number;
  };
  error.statusCode = 503;
  return error;
};

export const publishToQueue = async (queueName: string, message: unknown) => {
  if (!channel) {
    throw createRabbitMQUnavailableError();
  }

  await channel.assertQueue(queueName, { durable: true });
  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
    persistent: true,
  });
};
