import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { chatEnv } from "../config/env.js";

const { JsonWebTokenError, TokenExpiredError } = jwt;

interface IUser {
  _id: string;
  name: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: IUser | null;
}

const respondAuthError = (res: Response, message: string): void => {
  res.status(401).json({
    success: false,
    message,
  });
};

const getBearerToken = (authHeader?: string): string | null => {
  if (!authHeader) {
    return null;
  }

  const [scheme, token, ...rest] = authHeader.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
};

export const isAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    respondAuthError(
      res,
      "Authorization header must be in the format: Bearer <token>",
    );
    return;
  }

  try {
    const decodedValue = jwt.verify(token, chatEnv.JWT_PUBLIC_KEY, {
      algorithms: ["RS256"],
      issuer: chatEnv.JWT_ISSUER,
      audience: chatEnv.JWT_AUDIENCE,
    }) as JwtPayload;

    if (
      !decodedValue?.user?._id ||
      !decodedValue.user.email ||
      !decodedValue.user.name
    ) {
      respondAuthError(res, "Invalid token payload");
      return;
    }
    req.user = decodedValue.user;
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      respondAuthError(res, "Token expired");
      return;
    }

    if (error instanceof JsonWebTokenError) {
      respondAuthError(res, "Invalid token");
      return;
    }

    respondAuthError(res, "Authentication failed");
  }
};

export default isAuth;
