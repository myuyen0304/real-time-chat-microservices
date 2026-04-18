import jwt from "jsonwebtoken";

export const generateToken = (user: any) => {
  const privateKey = (process.env.JWT_PRIVATE_KEY as string).replace(/\\n/g, "\n");
  return jwt.sign({ user }, privateKey, {
    algorithm: "RS256",
    expiresIn: "15d",
  });
};
