import express from "express";
import dotenv from "dotenv";
import { starSendOtpConsumer } from "./consumer.js";

dotenv.config()
starSendOtpConsumer();

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "mail" }));

const port = process.env.PORT;

app.listen(port, () =>{
    console.log(`Server is running on port ${port}`);
});