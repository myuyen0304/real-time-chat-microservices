import dotenv from "dotenv";

dotenv.config();

const SERVICE_NAME = "chat-service";

const getRequiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `[${SERVICE_NAME}] Missing required environment variable: ${name}`,
    );
  }

  return value;
};

const getOptionalEnv = (name: string, fallback: string): string => {
  const value = process.env[name]?.trim();
  return value || fallback;
};

export const chatEnv = {
  PORT: getRequiredEnv("PORT"),
  MONGO_URI: getRequiredEnv("MONGO_URI"),
  MONGO_DB_NAME: getOptionalEnv("MONGO_DB_NAME", "ChatappMicroservice"),
  REDIS_URL: getRequiredEnv("REDIS_URL"),
  JWT_PUBLIC_KEY: getRequiredEnv("JWT_PUBLIC_KEY").replace(/\\n/g, "\n"),
  JWT_ISSUER: getOptionalEnv("JWT_ISSUER", "chat-app-auth"),
  JWT_AUDIENCE: getOptionalEnv("JWT_AUDIENCE", "chat-app-clients"),
  Rabbitmq_Host: getRequiredEnv("Rabbitmq_Host"),
  Rabbitmq_Username: getRequiredEnv("Rabbitmq_Username"),
  Rabbitmq_Password: getRequiredEnv("Rabbitmq_Password"),
  CLOUD_NAME: getRequiredEnv("CLOUD_NAME"),
  API_KEY: getRequiredEnv("API_KEY"),
  API_SECRET: getRequiredEnv("API_SECRET"),
};
