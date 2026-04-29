import { beforeEach, describe, expect, it, vi } from "vitest";

const redisState = vi.hoisted(() => {
  type RedisOptions = {
    socket?: {
      reconnectStrategy?: (retries: number, cause: Error) => number | Error;
    };
  };

  const handlers = new Map<string, (error?: Error) => void>();
  const client = {
    isOpen: false,
    isReady: false,
    connect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    on: vi.fn((event: string, handler: (error?: Error) => void) => {
      handlers.set(event, handler);
      return client;
    }),
  };
  let options: RedisOptions = {};

  const createClient = vi.fn((createOptions: RedisOptions) => {
    options = createOptions;
    return client;
  });

  const resetRuntime = () => {
    client.isOpen = false;
    client.isReady = false;
    client.connect.mockReset();
    client.connect.mockResolvedValue(undefined);
    client.close.mockReset();
    client.close.mockResolvedValue(undefined);
  };

  return {
    client,
    createClient,
    getOptions: () => options,
    handlers,
    resetRuntime,
  };
});

vi.mock("redis", () => ({
  createClient: redisState.createClient,
}));

vi.mock("../src/config/env.js", () => ({
  userEnv: {
    REDIS_URL: "redis://localhost:6379",
  },
}));

const {
  connectRedis,
  disconnectRedis,
  getRedisHealth,
} = await import("../src/config/redis.js");

describe("user Redis config", () => {
  beforeEach(() => {
    redisState.resetRuntime();
  });

  it("reports Redis as down when the client is not ready", () => {
    redisState.client.isOpen = true;
    redisState.client.isReady = false;

    expect(getRedisHealth()).toEqual({
      status: "down",
      isOpen: true,
      isReady: false,
    });
  });

  it("propagates Redis connection failures", async () => {
    redisState.client.connect.mockRejectedValueOnce(new Error("redis down"));

    await expect(connectRedis()).rejects.toThrow("redis down");
    expect(redisState.client.connect).toHaveBeenCalledTimes(1);
  });

  it("does not reconnect an already open Redis client", async () => {
    redisState.client.isOpen = true;

    await connectRedis();

    expect(redisState.client.connect).not.toHaveBeenCalled();
  });

  it("closes only an open Redis client", async () => {
    await disconnectRedis();
    expect(redisState.client.close).not.toHaveBeenCalled();

    redisState.client.isOpen = true;
    await disconnectRedis();

    expect(redisState.client.close).toHaveBeenCalledTimes(1);
  });

  it("returns an error after Redis reconnect attempts are exhausted", () => {
    const reconnectStrategy =
      redisState.getOptions().socket?.reconnectStrategy;

    expect(reconnectStrategy).toBeDefined();
    expect(reconnectStrategy?.(10, new Error("redis down"))).toEqual(
      expect.objectContaining({
        message:
          "[user-service] Redis reconnect attempts exhausted after 10 retries: redis down",
      }),
    );
  });
});
