import cors from "cors";
import express from "express";
import { cleanupStaleRingingCalls } from "./call/helpers.js";
import callRoutes from "./routes/call.js";
import chatRoutes from "./routes/chat.js";
import connectDB, { disconnectDB, getMongoHealth } from "./config/db.js";
import { chatEnv } from "./config/env.js";
import {
  closeRabbitMQ,
  getRabbitMQHealth,
  startUserEventsConsumer,
} from "./config/rabbitmq.js";
import {
  disconnectSocketRedisClients,
  getSocketRedisHealth,
} from "./config/redis.js";
import { app, io, server } from "./config/socket.js";

const port = chatEnv.PORT;
let isShuttingDown = false;

app.use(express.json());
app.use(cors({ origin: chatEnv.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
app.get("/health", (_req, res) => {
  const dependencies = {
    mongo: getMongoHealth(),
    rabbitmq: getRabbitMQHealth(),
    redis: getSocketRedisHealth(),
  };
  const isHealthy = Object.values(dependencies).every(
    (dependency) => dependency.status === "up",
  );

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    service: "chat",
    dependencies,
  });
});
app.use("/api/v1", chatRoutes);
app.use("/api/v1", callRoutes);

const closeSocketIo = async () => {
  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  });
};

const closeHttpServer = async () => {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

const shutdown = async (signal: NodeJS.Signals) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[chat-service] Received ${signal}, shutting down`);

  try {
    await closeSocketIo();
    await closeHttpServer();
    await Promise.allSettled([
      closeRabbitMQ(),
      disconnectSocketRedisClients(),
      disconnectDB(),
    ]);
    console.log("[chat-service] Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[chat-service] Shutdown failed", error);
    process.exit(1);
  }
};

const startServer = async () => {
  await connectDB();
  await cleanupStaleRingingCalls(chatEnv.CALL_RING_TIMEOUT_SECONDS).catch(
    (error) => console.error("[chat] Startup call cleanup failed", error),
  );
  await startUserEventsConsumer();

  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

startServer().catch((error) => {
  console.error("Failed to start chat service", error);
  process.exit(1);
});
