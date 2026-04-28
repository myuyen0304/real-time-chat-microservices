import amqp from "amqplib";
import { UserSnapshot } from "../model/UserSnapshot.js";
import { chatEnv } from "./env.js";

const RABBITMQ_CONNECT_RETRY_DELAY_MS = 3_000;
const RABBITMQ_MESSAGE_RETRY_DELAY_MS = 10_000;
const RABBITMQ_MAX_DELIVERY_ATTEMPTS = 3;
const USER_EVENTS_QUEUE = "user.events";

let connection: amqp.ChannelModel | undefined;
let channel: amqp.Channel | undefined;
let isUserEventsConsumerReady = false;

const waitForRetry = async () => {
  await new Promise((resolve) =>
    setTimeout(resolve, RABBITMQ_CONNECT_RETRY_DELAY_MS),
  );
};

const getRetryQueueName = (queueName: string) => `${queueName}.retry`;
const getDeadLetterQueueName = (queueName: string) => `${queueName}.dlq`;

const assertQueueWithRetryTopology = async (
  channel: amqp.Channel,
  queueName: string,
) => {
  await channel.assertQueue(queueName, { durable: true });
  await channel.assertQueue(getRetryQueueName(queueName), {
    durable: true,
    arguments: {
      "x-message-ttl": RABBITMQ_MESSAGE_RETRY_DELAY_MS,
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": queueName,
    },
  });
  await channel.assertQueue(getDeadLetterQueueName(queueName), {
    durable: true,
  });
};

const getRetryCount = (message: amqp.Message) => {
  const rawRetryCount = message.properties.headers?.["x-retry-count"];

  if (typeof rawRetryCount === "number") {
    return rawRetryCount;
  }

  if (typeof rawRetryCount === "string") {
    const parsedRetryCount = Number.parseInt(rawRetryCount, 10);
    return Number.isNaN(parsedRetryCount) ? 0 : parsedRetryCount;
  }

  return 0;
};

const retryOrDeadLetterMessage = (
  channel: amqp.Channel,
  queueName: string,
  message: amqp.Message,
) => {
  const retryCount = getRetryCount(message) + 1;
  const shouldDeadLetter = retryCount >= RABBITMQ_MAX_DELIVERY_ATTEMPTS;
  const targetQueue = shouldDeadLetter
    ? getDeadLetterQueueName(queueName)
    : getRetryQueueName(queueName);

  channel.sendToQueue(targetQueue, message.content, {
    contentType: message.properties.contentType,
    headers: {
      ...message.properties.headers,
      "x-retry-count": retryCount,
    },
    persistent: true,
  });
  channel.ack(message);

  if (shouldDeadLetter) {
    console.error(
      `Moved message from ${queueName} to ${targetQueue} after ${retryCount} failed attempts`,
    );
  } else {
    console.warn(
      `Scheduled retry ${retryCount}/${RABBITMQ_MAX_DELIVERY_ATTEMPTS} for ${queueName}`,
    );
  }
};

export const startUserEventsConsumer = async () => {
  while (true) {
    try {
      connection = await amqp.connect({
        protocol: "amqp",
        hostname: chatEnv.Rabbitmq_Host,
        port: 5672,
        username: chatEnv.Rabbitmq_Username,
        password: chatEnv.Rabbitmq_Password,
      });
      connection.on("close", () => {
        channel = undefined;
        connection = undefined;
        isUserEventsConsumerReady = false;
      });
      connection.on("error", (error) => {
        console.error("[chat-service] RabbitMQ connection error", error);
      });

      channel = await connection.createChannel();
      channel.on("close", () => {
        channel = undefined;
        isUserEventsConsumerReady = false;
      });
      channel.on("error", (error) => {
        console.error("[chat-service] RabbitMQ channel error", error);
      });
      const activeChannel = channel;
      const queueName = USER_EVENTS_QUEUE;
      await assertQueueWithRetryTopology(activeChannel, queueName);
      console.log("Chat service: listening for user events");

      activeChannel.consume(queueName, async (msg) => {
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
          activeChannel.ack(msg);
        } catch (error) {
          console.error("Failed to process user event", error);
          retryOrDeadLetterMessage(activeChannel, queueName, msg);
        }
      });

      isUserEventsConsumerReady = true;
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

export const getRabbitMQHealth = () => ({
  status: channel && connection && isUserEventsConsumerReady ? "up" : "down",
  channelOpen: Boolean(channel),
  connectionOpen: Boolean(connection),
  consumerReady: isUserEventsConsumerReady,
});

export const closeRabbitMQ = async () => {
  const activeChannel = channel;
  const activeConnection = connection;

  channel = undefined;
  connection = undefined;
  isUserEventsConsumerReady = false;

  await Promise.allSettled([
    activeChannel?.close(),
    activeConnection?.close(),
  ]);
};
