import dotenv from "dotenv";

dotenv.config();

const SERVICE_NAME = "mail-service";

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

export const mailEnv = {
  PORT: getRequiredEnv("PORT"),
  EMAIL_HOST: getOptionalEnv("EMAIL_HOST", "smtp.gmail.com"),
  EMAIL_PORT: Number(getOptionalEnv("EMAIL_PORT", "465")),
  EMAIL_USER: getRequiredEnv("EMAIL_USER"),
  EMAIL_PASSWORD: getRequiredEnv("EMAIL_PASSWORD"),
  Rabbitmq_Host: getRequiredEnv("Rabbitmq_Host"),
  Rabbitmq_Username: getRequiredEnv("Rabbitmq_Username"),
  Rabbitmq_Password: getRequiredEnv("Rabbitmq_Password"),
};
