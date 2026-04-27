import express from "express";
import connectDB from "./config/db.js";
import { createClient } from "redis";
import userRouter from "./routes/user.js";
import { connectRabbitMQ } from "./config/rabbitmq.js";
import cors from "cors";
import { userEnv } from "./config/env.js";

const app = express();
// 1. CORS - Luôn đầu tiên
app.use(cors({ origin: userEnv.CORS_ORIGIN.split(",").map((s) => s.trim()) }));

// 2️. Body parsers
app.use(express.json());

// 3️. Logger (nếu có)
// app.use(morgan("dev"));

// 4️. Routes - Cuối cùng
app.get("/health", (_req, res) => res.json({ status: "ok", service: "user" }));
app.use("/api/v1", userRouter);

export const redisClient = createClient({
  url: userEnv.REDIS_URL,
});

redisClient.on("error", (error) => {
  console.error("[user-service] Redis client error", error);
});

redisClient.on("reconnecting", () => {
  console.warn("[user-service] Redis client reconnecting");
});

const port = userEnv.PORT;

const startServer = async () => {
  await connectDB();
  await connectRabbitMQ();
  await redisClient.connect();
  console.log("Connected to Redis");

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start user service", error);
  process.exit(1);
});
