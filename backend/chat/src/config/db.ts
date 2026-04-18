import mongoose from "mongoose";
import { chatEnv } from "./env.js";

const SERVICE_NAME = "chat-service";

const connectDB = async () => {
  const url = chatEnv.MONGO_URI;
  const dbName = chatEnv.MONGO_DB_NAME;
  try {
    await mongoose.connect(url, {
      dbName,
    });
    console.log(
      `[${SERVICE_NAME}] Connected to MongoDB database \"${dbName}\"`,
    );
  } catch (error) {
    console.error(`[${SERVICE_NAME}] Failed to connect to MongoDB`, error);
    process.exit(1);
  }
};

export default connectDB;
