import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rabbitMqState = vi.hoisted(() => {
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
    nack: vi.fn(),
  };

  const connection = {
    on: vi.fn(),
    close: vi.fn(async () => undefined),
    createChannel: vi.fn(async () => channel),
  };

  const connect = vi.fn(async () => connection);

  const reset = () => {
    consumeHandlers.length = 0;
    connection.on.mockClear();
    connection.close.mockClear();
    connection.createChannel.mockClear();
    channel.on.mockClear();
    channel.close.mockClear();
    channel.assertQueue.mockClear();
    channel.consume.mockClear();
    channel.sendToQueue.mockClear();
    channel.ack.mockClear();
    channel.nack.mockClear();
    connect.mockClear();
  };

  return { channel, connect, connection, consumeHandlers, reset };
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
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      properties: {},
    });

    expect(snapshots.findByIdAndUpdate).toHaveBeenCalledWith(
      "507f1f77bcf86cd799439012",
      { name: "Bob", email: "bob@example.com" },
      { upsert: true, new: true },
    );
    expect(rabbitMqState.channel.ack).toHaveBeenCalledTimes(1);
    expect(rabbitMqState.channel.sendToQueue).not.toHaveBeenCalled();
    expect(rabbitMqState.channel.nack).not.toHaveBeenCalled();
  });

  it("schedules a delayed retry when processing a user event fails", async () => {
    snapshots.findByIdAndUpdate.mockRejectedValueOnce(new Error("db down"));
    await startUserEventsConsumer();

    const handler = rabbitMqState.consumeHandlers[0];
    const content = Buffer.from(
      JSON.stringify({
        type: "user.upserted",
        payload: {
          _id: "507f1f77bcf86cd799439012",
          name: "Bob",
          email: "bob@example.com",
        },
      }),
    );

    await handler?.({
      content,
      properties: { contentType: "application/json", headers: {} },
    });

    expect(rabbitMqState.channel.sendToQueue).toHaveBeenCalledWith(
      "user.events.retry",
      content,
      {
        contentType: "application/json",
        headers: { "x-retry-count": 1 },
        persistent: true,
      },
    );
    expect(rabbitMqState.channel.ack).toHaveBeenCalledTimes(1);
    expect(rabbitMqState.channel.nack).not.toHaveBeenCalled();
  });

  it("moves a repeatedly failing user event to the DLQ", async () => {
    snapshots.findByIdAndUpdate.mockRejectedValueOnce(new Error("db down"));
    await startUserEventsConsumer();

    const handler = rabbitMqState.consumeHandlers[0];
    const content = Buffer.from(
      JSON.stringify({
        type: "user.upserted",
        payload: {
          _id: "507f1f77bcf86cd799439012",
          name: "Bob",
          email: "bob@example.com",
        },
      }),
    );

    await handler?.({
      content,
      properties: {
        contentType: "application/json",
        headers: { "x-retry-count": 2 },
      },
    });

    expect(rabbitMqState.channel.sendToQueue).toHaveBeenCalledWith(
      "user.events.dlq",
      content,
      {
        contentType: "application/json",
        headers: { "x-retry-count": 3 },
        persistent: true,
      },
    );
    expect(rabbitMqState.channel.ack).toHaveBeenCalledTimes(1);
    expect(rabbitMqState.channel.nack).not.toHaveBeenCalled();
  });
});
