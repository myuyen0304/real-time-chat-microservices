import express from "express";
import { starSendOtpConsumer } from "./consumer.js";
import { mailEnv } from "./config/env.js";

starSendOtpConsumer();

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "mail" }));

const port = mailEnv.PORT;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
