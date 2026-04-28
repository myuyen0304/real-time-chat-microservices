import amqp from "amqplib";
import nodemailer from "nodemailer";
import { mailEnv } from "./config/env.js";

const RABBITMQ_CONNECT_RETRY_DELAY_MS = 3_000;
const RABBITMQ_MESSAGE_RETRY_DELAY_MS = 10_000;
const RABBITMQ_MAX_DELIVERY_ATTEMPTS = 3;
const SEND_OTP_QUEUE = "send-otp";

let connection: amqp.ChannelModel | undefined;
let channel: amqp.Channel | undefined;
let isSendOtpConsumerReady = false;

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

export const starSendOtpConsumer = async () => {
  while (true) {
    try {
      connection = await amqp.connect({
        protocol: "amqp",
        hostname: mailEnv.Rabbitmq_Host,
        port: 5672,
        username: mailEnv.Rabbitmq_Username,
        password: mailEnv.Rabbitmq_Password,
      });
      connection.on("close", () => {
        channel = undefined;
        connection = undefined;
        isSendOtpConsumerReady = false;
      });
      connection.on("error", (error) => {
        console.error("[mail-service] RabbitMQ connection error", error);
      });

      channel = await connection.createChannel();
      channel.on("close", () => {
        channel = undefined;
        isSendOtpConsumerReady = false;
      });
      channel.on("error", (error) => {
        console.error("[mail-service] RabbitMQ channel error", error);
      });
      const activeChannel = channel;
      const queueName = SEND_OTP_QUEUE;

      await assertQueueWithRetryTopology(activeChannel, queueName);

      console.log("Mail service consumer started, listening for otp emails");

      activeChannel.consume(queueName, async (msg) => {
        if (msg) {
          try {
            const { to, subject, body } = JSON.parse(msg.content.toString());

            const transporter = nodemailer.createTransport({
              host: mailEnv.EMAIL_HOST,
              port: mailEnv.EMAIL_PORT,
              secure: mailEnv.EMAIL_PORT === 465,
              auth: {
                user: mailEnv.EMAIL_USER,
                pass: mailEnv.EMAIL_PASSWORD,
              },
            });
            await transporter.sendMail({
              from: "Chat app",
              to,
              subject,
              text: body,
            });
            console.log(`OTP mail sent to ${to}`);
            activeChannel.ack(msg);
          } catch (error) {
            console.error("Failed to send otp", error);
            retryOrDeadLetterMessage(activeChannel, queueName, msg);
          }
        }
      });

      isSendOtpConsumerReady = true;
      return;
    } catch (error) {
      console.error(
        "Fail to start rabbitmq consumer, retrying in 3 seconds",
        error,
      );
      await waitForRetry();
    }
  }
};

export const getRabbitMQHealth = () => ({
  status: channel && connection && isSendOtpConsumerReady ? "up" : "down",
  channelOpen: Boolean(channel),
  connectionOpen: Boolean(connection),
  consumerReady: isSendOtpConsumerReady,
});

export const closeRabbitMQ = async () => {
  const activeChannel = channel;
  const activeConnection = connection;

  channel = undefined;
  connection = undefined;
  isSendOtpConsumerReady = false;

  await Promise.allSettled([
    activeChannel?.close(),
    activeConnection?.close(),
  ]);
};
