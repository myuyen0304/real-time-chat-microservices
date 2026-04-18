import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import chatRoutes from "./routes/chat.js";
import cors from "cors";
import { app, server } from "./config/socket.js";
import { startUserEventsConsumer } from "./config/rabbitmq.js";

dotenv.config();
const port = process.env.PORT;

app.use(express.json());
app.use(cors());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "chat" }));
app.use("/api/v1", chatRoutes);

connectDB();
startUserEventsConsumer();

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
