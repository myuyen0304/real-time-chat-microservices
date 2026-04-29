import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mailState = vi.hoisted(() => {
  type TestMessage = {
    content: Buffer;
    properties: {
      contentType?: string;
      headers?: Record<string, unknown>;
    };
  };

  const consumeHandlers: Array<
    (message: TestMessage | null) => Promise<void> | void
  > = [];
  const transport = {
    sendMail: vi.fn(async () => undefined),
  };
  const createTransport = vi.fn(() => transport);
  const channel = {
    on: vi.fn(),
    close: vi.fn(async () => undefined),
    assertQueue: vi.fn(async () => undefined),
    consume: vi.fn(
      async (
        _queue: string,
        handler: (message: TestMessage | null) => Promise<void> | void,
      ) => {
        consumeHandlers.push(handler);
      },
    ),
    sendToQueue: vi.fn(),
    ack: vi.fn(),
  };

  const connection = {
    on: vi.fn(),
    close: vi.fn(async () => undefined),
    createChannel: vi.fn(async () => channel),
  };

  const connect = vi.fn(async () => connection);

  const reset = () => {
    consumeHandlers.length = 0;
    transport.sendMail.mockReset();
    transport.sendMail.mockResolvedValue(undefined);
    createTransport.mockClear();
    connection.on.mockClear();
    connection.close.mockClear();
    connection.createChannel.mockClear();
    channel.on.mockClear();
    channel.close.mockClear();
    channel.assertQueue.mockClear();
    channel.consume.mockClear();
    channel.sendToQueue.mockClear();
    channel.ack.mockClear();
    connect.mockClear();
  };

  return {
    channel,
    connect,
    connection,
    consumeHandlers,
    createTransport,
    reset,
    transport,
  };
});

vi.mock("amqplib", () => ({
  default: { connect: mailState.connect },
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mailState.createTransport },
}));

vi.mock("../src/config/env.js", () => ({
  mailEnv: {
    EMAIL_HOST: "smtp.example.com",
    EMAIL_PORT: 465,
    EMAIL_USER: "mailer@example.com",
    EMAIL_PASSWORD: "mail-password",
    Rabbitmq_Host: "localhost",
    Rabbitmq_Username: "guest",
    Rabbitmq_Password: "guest",
  },
}));

const {
  closeRabbitMQ,
  getRabbitMQHealth,
  starSendOtpConsumer,
} = await import("../src/consumer.js");

describe("mail send-otp consumer", () => {
  beforeEach(async () => {
    await closeRabbitMQ();
    mailState.reset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends OTP email messages and acknowledges them", async () => {
    await starSendOtpConsumer();

    const handler = mailState.consumeHandlers[0];
    expect(handler).toBeDefined();

    const content = Buffer.from(
      JSON.stringify({
        to: "alice@example.com",
        subject: "Your OTP",
        body: "123456",
      }),
    );

    await handler?.({
      content,
      properties: { contentType: "application/json", headers: {} },
    });

    expect(mailState.channel.assertQueue).toHaveBeenCalledWith("send-otp", {
      durable: true,
    });
    expect(mailState.channel.assertQueue).toHaveBeenCalledWith(
      "send-otp.retry",
      {
        durable: true,
        arguments: {
          "x-message-ttl": 10_000,
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": "send-otp",
        },
      },
    );
    expect(mailState.channel.assertQueue).toHaveBeenCalledWith(
      "send-otp.dlq",
      { durable: true },
    );
    expect(mailState.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: {
        user: "mailer@example.com",
        pass: "mail-password",
      },
    });
    expect(mailState.transport.sendMail).toHaveBeenCalledWith({
      from: "Chat app",
      to: "alice@example.com",
      subject: "Your OTP",
      text: "123456",
    });
    expect(mailState.channel.ack).toHaveBeenCalledTimes(1);
    expect(mailState.channel.sendToQueue).not.toHaveBeenCalled();
    expect(getRabbitMQHealth()).toEqual({
      status: "up",
      channelOpen: true,
      connectionOpen: true,
      consumerReady: true,
    });
  });

  it("schedules a delayed retry when sending mail fails", async () => {
    mailState.transport.sendMail.mockRejectedValueOnce(new Error("smtp down"));
    await starSendOtpConsumer();

    const handler = mailState.consumeHandlers[0];
    const content = Buffer.from(
      JSON.stringify({
        to: "alice@example.com",
        subject: "Your OTP",
        body: "123456",
      }),
    );

    await handler?.({
      content,
      properties: { contentType: "application/json", headers: {} },
    });

    expect(mailState.channel.sendToQueue).toHaveBeenCalledWith(
      "send-otp.retry",
      content,
      {
        contentType: "application/json",
        headers: { "x-retry-count": 1 },
        persistent: true,
      },
    );
    expect(mailState.channel.ack).toHaveBeenCalledTimes(1);
  });

  it("moves repeatedly failing mail messages to the DLQ", async () => {
    mailState.transport.sendMail.mockRejectedValueOnce(new Error("smtp down"));
    await starSendOtpConsumer();

    const handler = mailState.consumeHandlers[0];
    const content = Buffer.from(
      JSON.stringify({
        to: "alice@example.com",
        subject: "Your OTP",
        body: "123456",
      }),
    );

    await handler?.({
      content,
      properties: {
        contentType: "application/json",
        headers: { "x-retry-count": 2 },
      },
    });

    expect(mailState.channel.sendToQueue).toHaveBeenCalledWith(
      "send-otp.dlq",
      content,
      {
        contentType: "application/json",
        headers: { "x-retry-count": 3 },
        persistent: true,
      },
    );
    expect(mailState.channel.ack).toHaveBeenCalledTimes(1);
  });
});
