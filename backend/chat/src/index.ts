import express from "express";
import connectDB from "./config/db.js";
import chatRoutes from "./routes/chat.js";
import callRoutes from "./routes/call.js";
import cors from "cors";
import { app, server } from "./config/socket.js";
import { startUserEventsConsumer } from "./config/rabbitmq.js";
import { chatEnv } from "./config/env.js";

const port = chatEnv.PORT;

app.use(express.json());
app.use(cors());
app.get("/health", (_req, res) => res.json({ status: "ok", service: "chat" }));
app.use("/api/v1", chatRoutes);
app.use("/api/v1", callRoutes);

connectDB();
startUserEventsConsumer();

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
