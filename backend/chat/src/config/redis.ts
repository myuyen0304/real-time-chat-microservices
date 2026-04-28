import { createClient } from "redis";
import { chatEnv } from "./env.js";

const isTlsRedisUrl = chatEnv.REDIS_URL.startsWith("rediss://");
const REDIS_CONNECT_TIMEOUT_MS = 5_000;
const REDIS_MAX_RECONNECT_RETRIES = 10;
const REDIS_BASE_RECONNECT_DELAY_MS = 100;
const REDIS_MAX_RECONNECT_DELAY_MS = 3_000;
const REDIS_TRANSIENT_LOG_INTERVAL_MS = 30_000;

const transientRedisErrorCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

const isTransientRedisError = (error: Error) => {
  const errorCode = (error as NodeJS.ErrnoException).code;

  return (
    error.name === "ConnectionTimeoutError" ||
    error.name === "SocketTimeoutError" ||
    (typeof errorCode === "string" && transientRedisErrorCodes.has(errorCode))
  );
};

const formatRedisError = (error: Error) => {
  const errorCode = (error as NodeJS.ErrnoException).code;
  return `${error.name}${errorCode ? ` (${errorCode})` : ""}: ${
    error.message
  }`;
};

const createRedisErrorLogger = (clientName: string) => {
  let lastTransientLogAt = 0;
  let suppressedTransientErrors = 0;

  return (error: Error) => {
    const now = Date.now();
    const isTransient = isTransientRedisError(error);

    if (
      isTransient &&
      now - lastTransientLogAt < REDIS_TRANSIENT_LOG_INTERVAL_MS
    ) {
      suppressedTransientErrors += 1;
      return;
    }

    const suppressedSuffix =
      suppressedTransientErrors > 0
        ? `; suppressed ${suppressedTransientErrors} transient Redis errors`
        : "";

    if (isTransient) {
      console.warn(
        `[chat-service] Redis ${clientName} transient connection error${suppressedSuffix}: ${formatRedisError(
          error,
        )}`,
      );
      lastTransientLogAt = now;
    } else {
      console.error(
        `[chat-service] Redis ${clientName} client error${suppressedSuffix}`,
        error,
      );
    }

    suppressedTransientErrors = 0;
  };
};

const createRedisReconnectLogger = (clientName: string) => {
  let lastReconnectLogAt = 0;
  let suppressedReconnectLogs = 0;

  return () => {
    const now = Date.now();

    if (now - lastReconnectLogAt < REDIS_TRANSIENT_LOG_INTERVAL_MS) {
      suppressedReconnectLogs += 1;
      return;
    }

    const suppressedSuffix =
      suppressedReconnectLogs > 0
        ? `; suppressed ${suppressedReconnectLogs} reconnect notices`
        : "";

    console.warn(
      `[chat-service] Redis ${clientName} client reconnecting${suppressedSuffix}`,
    );
    suppressedReconnectLogs = 0;
    lastReconnectLogAt = now;
  };
};

const reconnectStrategy = (retries: number, cause: Error) => {
  if (retries >= REDIS_MAX_RECONNECT_RETRIES) {
    return new Error(
      `[chat-service] Redis reconnect attempts exhausted after ${retries} retries: ${cause.message}`,
    );
  }

  const exponentialDelay = REDIS_BASE_RECONNECT_DELAY_MS * 2 ** retries;
  const jitter = Math.floor(Math.random() * REDIS_BASE_RECONNECT_DELAY_MS);

  return Math.min(exponentialDelay + jitter, REDIS_MAX_RECONNECT_DELAY_MS);
};

export const socketRedisPubClient = createClient({
  url: chatEnv.REDIS_URL,
  socket: isTlsRedisUrl
    ? {
        tls: true,
        rejectUnauthorized: false,
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy,
      }
    : { connectTimeout: REDIS_CONNECT_TIMEOUT_MS, reconnectStrategy },
});

export const socketRedisSubClient = socketRedisPubClient.duplicate();

socketRedisPubClient.on("error", createRedisErrorLogger("pub"));
socketRedisPubClient.on("reconnecting", createRedisReconnectLogger("pub"));
socketRedisSubClient.on("error", createRedisErrorLogger("sub"));
socketRedisSubClient.on("reconnecting", createRedisReconnectLogger("sub"));

export const connectSocketRedisClients = async () => {
  await Promise.all([
    socketRedisPubClient.connect(),
    socketRedisSubClient.connect(),
  ]);
};

export const getSocketRedisHealth = () => ({
  status:
    socketRedisPubClient.isReady && socketRedisSubClient.isReady
      ? "up"
      : "down",
  pub: {
    isOpen: socketRedisPubClient.isOpen,
    isReady: socketRedisPubClient.isReady,
  },
  sub: {
    isOpen: socketRedisSubClient.isOpen,
    isReady: socketRedisSubClient.isReady,
  },
});

export const disconnectSocketRedisClients = async () => {
  await Promise.all([
    socketRedisPubClient.isOpen
      ? socketRedisPubClient.close()
      : Promise.resolve(),
    socketRedisSubClient.isOpen
      ? socketRedisSubClient.close()
      : Promise.resolve(),
  ]);
};
