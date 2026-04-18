import express from "express";
import connectDB from "./config/db.js";
import { createClient } from "redis";
import userRouter from "./routes/user.js";
import { connectRabbitMQ } from "./config/rabbitmq.js";
import cors from "cors";
import { userEnv } from "./config/env.js";

const app = express();
// 1. CORS - Luôn đầu tiên
app.use(cors());

// 2️. Body parsers
app.use(express.json());

// 3️. Logger (nếu có)
// app.use(morgan("dev"));

// 4️. Routes - Cuối cùng
app.get("/health", (_req, res) => res.json({ status: "ok", service: "user" }));
app.use("/api/v1", userRouter);

connectDB();
connectRabbitMQ();

export const redisClient = createClient({
  url: userEnv.REDIS_URL,
});
redisClient
  .connect()
  .then(() => console.log("Connected to Redis"))
  .catch((error) => {
    console.error("Failed to connect to Redis", error);
    process.exit(1);
  });

const port = userEnv.PORT;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
