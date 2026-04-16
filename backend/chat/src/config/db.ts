import mongoose from "mongoose";

const DEFAULT_DB_NAME = "ChatappMicroservice";
const SERVICE_NAME = "chat-service";

const connectDB = async () => {
  const url = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || DEFAULT_DB_NAME;

  if (!url) {
    throw new Error("MONGO_URI is not defined in env variables");
  }
  try {
    await mongoose.connect(url, {
      dbName,
    });
    if (!process.env.MONGO_DB_NAME) {
      console.warn(
        `[${SERVICE_NAME}] MONGO_DB_NAME is not set. Falling back to ${DEFAULT_DB_NAME}.`,
      );
    }
    console.log(
      `[${SERVICE_NAME}] Connected to MongoDB database \"${dbName}\"`,
    );
  } catch (error) {
    console.error(`[${SERVICE_NAME}] Failed to connect to MongoDB`, error);
    process.exit(1);
  }
};

export default connectDB;
