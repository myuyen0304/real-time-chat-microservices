import amqp from "amqplib";
import { userEnv } from "./env.js";

let connection: amqp.ChannelModel | undefined;
let channel: amqp.Channel | undefined;

const RABBITMQ_CONNECT_RETRY_DELAY_MS = 3_000;
const RABBITMQ_MESSAGE_RETRY_DELAY_MS = 10_000;

const waitForRetry = async () => {
  await new Promise((resolve) =>
    setTimeout(resolve, RABBITMQ_CONNECT_RETRY_DELAY_MS),
  );
};

const getRetryQueueName = (queueName: string) => `${queueName}.retry`;
const getDeadLetterQueueName = (queueName: string) => `${queueName}.dlq`;

const assertQueueWithRetryTopology = async (
  targetChannel: amqp.Channel,
  queueName: string,
) => {
  await targetChannel.assertQueue(queueName, { durable: true });
  await targetChannel.assertQueue(getRetryQueueName(queueName), {
    durable: true,
    arguments: {
      "x-message-ttl": RABBITMQ_MESSAGE_RETRY_DELAY_MS,
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": queueName,
    },
  });
  await targetChannel.assertQueue(getDeadLetterQueueName(queueName), {
    durable: true,
  });
};

export const connectRabbitMQ = async () => {
  while (!channel) {
    try {
      connection = await amqp.connect({
        protocol: "amqp",
        hostname: userEnv.Rabbitmq_Host,
        port: 5672,
        username: userEnv.Rabbitmq_Username,
        password: userEnv.Rabbitmq_Password,
      });
      connection.on("close", () => {
        channel = undefined;
        connection = undefined;
      });
      connection.on("error", (error) => {
        console.error("[user-service] RabbitMQ connection error", error);
      });
      channel = await connection.createChannel();
      channel.on("close", () => {
        channel = undefined;
      });
      channel.on("error", (error) => {
        console.error("[user-service] RabbitMQ channel error", error);
      });
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

  await assertQueueWithRetryTopology(channel, queueName);
  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
    contentType: "application/json",
    persistent: true,
  });
};

export const getRabbitMQHealth = () => ({
  status: channel && connection ? "up" : "down",
  channelOpen: Boolean(channel),
  connectionOpen: Boolean(connection),
});

export const closeRabbitMQ = async () => {
  const activeChannel = channel;
  const activeConnection = connection;

  channel = undefined;
  connection = undefined;

  await Promise.allSettled([
    activeChannel?.close(),
    activeConnection?.close(),
  ]);
};
