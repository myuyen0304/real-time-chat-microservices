import jwt from "jsonwebtoken";
import { userEnv } from "./env.js";

export const generateToken = (user: any) => {
  return jwt.sign({ user }, userEnv.JWT_PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: "15d",
    issuer: userEnv.JWT_ISSUER,
    audience: userEnv.JWT_AUDIENCE,
    subject: user._id?.toString?.() ?? String(user._id),
  });
};
