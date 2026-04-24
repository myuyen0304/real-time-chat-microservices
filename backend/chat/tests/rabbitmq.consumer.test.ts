import { beforeEach, describe, expect, it, vi } from "vitest";

const rabbitMqState = vi.hoisted(() => {
  const consumeHandlers: Array<
    (message: { content: Buffer } | null) => Promise<void> | void
  > = [];
  const channel = {
    assertQueue: vi.fn(async () => undefined),
    consume: vi.fn(
      async (
        _queue: string,
        handler: (message: { content: Buffer } | null) => Promise<void> | void,
      ) => {
        consumeHandlers.push(handler);
      },
    ),
    ack: vi.fn(),
    nack: vi.fn(),
  };

  const connect = vi.fn(async () => ({
    createChannel: vi.fn(async () => channel),
  }));

  const reset = () => {
    consumeHandlers.length = 0;
    channel.assertQueue.mockClear();
    channel.consume.mockClear();
    channel.ack.mockClear();
    channel.nack.mockClear();
    connect.mockClear();
  };

  return { channel, connect, consumeHandlers, reset };
});

const snapshots = vi.hoisted(() => ({
  findByIdAndUpdate: vi.fn(async () => undefined),
}));

vi.mock("amqplib", () => ({
  default: { connect: rabbitMqState.connect },
}));

vi.mock("../src/model/UserSnapshot.js", () => ({
  UserSnapshot: snapshots,
}));

vi.mock("../src/config/env.js", () => ({
  chatEnv: {
    Rabbitmq_Host: "localhost",
    Rabbitmq_Username: "guest",
    Rabbitmq_Password: "guest",
  },
}));

const { startUserEventsConsumer } = await import("../src/config/rabbitmq.js");

describe("chat user event consumer", () => {
  beforeEach(() => {
    rabbitMqState.reset();
    snapshots.findByIdAndUpdate.mockClear();
  });

  it("upserts the UserSnapshot when a user.upserted event is consumed", async () => {
    await startUserEventsConsumer();

    const handler = rabbitMqState.consumeHandlers[0];
    expect(handler).toBeDefined();

    await handler?.({
      content: Buffer.from(
        JSON.stringify({
          type: "user.upserted",
          payload: {
            _id: "507f1f77bcf86cd799439012",
            name: "Bob",
            email: "bob@example.com",
          },
        }),
      ),
    });

    expect(snapshots.findByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439012",
      { name: "Bob", email: "bob@example.com" },
      { upsert: true, new: true },
    );
    expect(rabbitMqState.channel.ack).toHaveBeenCalledTimes(1);
    expect(rabbitMqState.channel.nack).not.toHaveBeenCalled();
  });
});
