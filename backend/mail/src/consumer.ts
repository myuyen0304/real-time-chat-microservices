import amqp from "amqplib";
import nodemailer from "nodemailer";
import { mailEnv } from "./config/env.js";

const RABBITMQ_RETRY_DELAY_MS = 3000;

const waitForRetry = async () => {
  await new Promise((resolve) => setTimeout(resolve, RABBITMQ_RETRY_DELAY_MS));
};

export const starSendOtpConsumer = async () => {
  while (true) {
    try {
      const connection = await amqp.connect({
        protocol: "amqp",
        hostname: mailEnv.Rabbitmq_Host,
        port: 5672,
        username: mailEnv.Rabbitmq_Username,
        password: mailEnv.Rabbitmq_Password,
      });
      const channel = await connection.createChannel();
      const queueName = "send-otp";

      await channel.assertQueue(queueName, { durable: true });

      console.log("Mail service consumer started, listening for otp emails");

      channel.consume(queueName, async (msg) => {
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
            channel.ack(msg);
          } catch (error) {
            console.error("Failed to send otp", error);
          }
        }
      });

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
