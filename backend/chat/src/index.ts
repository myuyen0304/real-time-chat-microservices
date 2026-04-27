import express from "express";
import connectDB from "./config/db.js";
import chatRoutes from "./routes/chat.js";
import callRoutes from "./routes/call.js";
import cors from "cors";
import { app, server } from "./config/socket.js";
import { startUserEventsConsumer } from "./config/rabbitmq.js";
import { chatEnv } from "./config/env.js";
import { cleanupStaleRingingCalls } from "./call/helpers.js";

const port = chatEnv.PORT;

app.use(express.json());
app.use(cors({ origin: chatEnv.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "chat" }));
app.use("/api/v1", chatRoutes);
app.use("/api/v1", callRoutes);

// connectDB exits the process on failure, so the .then() only runs on success.
void connectDB().then(() =>
  cleanupStaleRingingCalls(chatEnv.CALL_RING_TIMEOUT_SECONDS).catch((error) =>
    console.error("[chat] Startup call cleanup failed", error),
  ),
);
startUserEventsConsumer();

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
