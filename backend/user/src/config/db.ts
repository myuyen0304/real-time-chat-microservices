import mongoose from "mongoose";
import { userEnv } from "./env.js";

const SERVICE_NAME = "user-service";

const connectDB = async () => {
  const url = userEnv.MONGO_URI;
  const dbName = userEnv.MONGO_DB_NAME;
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
