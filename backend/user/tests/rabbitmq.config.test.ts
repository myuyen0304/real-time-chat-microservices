import { beforeEach, describe, expect, it, vi } from "vitest";

const rabbitMqState = vi.hoisted(() => {
  const channel = {
    on: vi.fn(),
    close: vi.fn(async () => undefined),
    assertQueue: vi.fn(async () => undefined),
    sendToQueue: vi.fn(),
  };

  const connection = {
    on: vi.fn(),
    close: vi.fn(async () => undefined),
    createChannel: vi.fn(async () => channel),
  };

  const connect = vi.fn(async () => connection);

  const reset = () => {
    connection.on.mockClear();
    connection.close.mockClear();
    connection.createChannel.mockClear();
    channel.on.mockClear();
    channel.close.mockClear();
    channel.assertQueue.mockClear();
    channel.sendToQueue.mockClear();
    connect.mockClear();
  };

  return { channel, connect, connection, reset };
});

vi.mock("amqplib", () => ({
  default: { connect: rabbitMqState.connect },
}));

vi.mock("../src/config/env.js", () => ({
  userEnv: {
    Rabbitmq_Host: "localhost",
    Rabbitmq_Username: "guest",
    Rabbitmq_Password: "guest",
  },
}));

const {
  closeRabbitMQ,
  connectRabbitMQ,
  getRabbitMQHealth,
  publishToQueue,
} = await import("../src/config/rabbitmq.js");

describe("user RabbitMQ config", () => {
  beforeEach(async () => {
    await closeRabbitMQ();
    rabbitMqState.reset();
  });

  it("throws a service unavailable error when publishing before RabbitMQ is connected", async () => {
    await expect(
      publishToQueue("mail.otp", { type: "send-otp" }),
    ).rejects.toMatchObject({
      message: "RabbitMQ channel is not initialized",
      statusCode: 503,
    });

    expect(rabbitMqState.channel.sendToQueue).not.toHaveBeenCalled();
    expect(getRabbitMQHealth()).toEqual({
      status: "down",
      channelOpen: false,
      connectionOpen: false,
    });
  });

  it("declares retry topology before publishing messages", async () => {
    await connectRabbitMQ();

    await publishToQueue("mail.otp", {
      type: "send-otp",
      payload: { email: "alice@example.com" },
    });

    expect(rabbitMqState.channel.assertQueue).toHaveBeenCalledWith("mail.otp", {
      durable: true,
    });
    expect(rabbitMqState.channel.assertQueue).toHaveBeenCalledWith(
      "mail.otp.retry",
      {
        durable: true,
        arguments: {
          "x-message-ttl": 10_000,
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": "mail.otp",
        },
      },
    );
    expect(rabbitMqState.channel.assertQueue).toHaveBeenCalledWith(
      "mail.otp.dlq",
      { durable: true },
    );
    expect(rabbitMqState.channel.sendToQueue).toHaveBeenCalledWith(
      "mail.otp",
      Buffer.from(
        JSON.stringify({
          type: "send-otp",
          payload: { email: "alice@example.com" },
        }),
      ),
      {
        contentType: "application/json",
        persistent: true,
      },
    );
    expect(getRabbitMQHealth()).toEqual({
      status: "up",
      channelOpen: true,
      connectionOpen: true,
    });
  });
});
