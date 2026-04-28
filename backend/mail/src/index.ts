import express from "express";
import {
  closeRabbitMQ,
  getRabbitMQHealth,
  starSendOtpConsumer,
} from "./consumer.js";
import { mailEnv } from "./config/env.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  const dependencies = {
    rabbitmq: getRabbitMQHealth(),
  };
  const isHealthy = Object.values(dependencies).every(
    (dependency) => dependency.status === "up",
  );

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "ok" : "degraded",
    service: "mail",
    dependencies,
  });
});

const port = mailEnv.PORT;
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

const shutdown = async (signal: string) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[mail-service] Received ${signal}, shutting down`);

  try {
    await closeHttpServer();
    await closeRabbitMQ();
    console.log("[mail-service] Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[mail-service] Shutdown failed", error);
    process.exit(1);
  }
};

server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

void starSendOtpConsumer().catch((error) => {
  console.error("[mail-service] RabbitMQ consumer stopped unexpectedly", error);
  process.exit(1);
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
