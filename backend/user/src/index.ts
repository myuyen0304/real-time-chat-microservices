import cors from "cors";
import express from "express";
import connectDB, { disconnectDB, getMongoHealth } from "./config/db.js";
import { userEnv } from "./config/env.js";
import {
  closeRabbitMQ,
  connectRabbitMQ,
  getRabbitMQHealth,
} from "./config/rabbitmq.js";
import {
  connectRedis,
  disconnectRedis,
  getRedisHealth,
} from "./config/redis.js";
import userRouter from "./routes/user.js";

const app = express();

app.use(cors({ origin: userEnv.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
app.use(express.json());

app.get("/health", (_req, res) => {
  const dependencies = {
    mongo: getMongoHealth(),
    rabbitmq: getRabbitMQHealth(),
    redis: getRedisHealth(),
  };
  const isHealthy = Object.values(dependencies).every(
    (dependency) => dependency.status === "up",
  );

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    service: "user",
    dependencies,
  });
});
app.use("/api/v1", userRouter);

const port = userEnv.PORT;
let server: ReturnType<typeof app.listen> | undefined;
let isShuttingDown = false;

const closeHttpServer = async () => {
  if (!server?.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
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
  console.log(`[user-service] Received ${signal}, shutting down`);

  try {
    await closeHttpServer();
    await Promise.allSettled([
      closeRabbitMQ(),
      disconnectRedis(),
      disconnectDB(),
    ]);
    console.log("[user-service] Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[user-service] Shutdown failed", error);
    process.exit(1);
  }
};

const startServer = async () => {
  await connectDB();
  await connectRabbitMQ();
  await connectRedis();

  server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

startServer().catch((error) => {
  console.error("Failed to start user service", error);
  process.exit(1);
});
