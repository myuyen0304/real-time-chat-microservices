import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { chatEnv } from "./env.js";

const { JsonWebTokenError, TokenExpiredError } = jwt;

const app = express();
const server = http.createServer(app);
const userSocketMap = new Map<string, Set<string>>();

interface SocketUser {
  _id: string;
  name: string;
  email: string;
}

interface AuthenticatedSocket extends Socket {
  data: Socket["data"] & { user?: SocketUser };
}

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const pubClient = createClient({ url: chatEnv.REDIS_URL });
const subClient = pubClient.duplicate();

const getOnlineUsers = (): string[] => Array.from(userSocketMap.keys());

const broadcastOnlineUsers = () => {
  io.emit("getOnlineUser", getOnlineUsers());
};

Promise.all([pubClient.connect(), subClient.connect()])
  .then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.IO Redis adapter connected");
  })
  .catch((error) => {
    console.error("Socket.IO Redis adapter failed to connect", error);
    process.exit(1);
  });

const getBearerToken = (authorization?: string): string | null => {
  if (!authorization) {
    return null;
  }

  const [scheme, token, ...rest] = authorization.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
};

const verifySocketToken = (token: string): SocketUser => {
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
    throw new JsonWebTokenError("Invalid token payload");
  }

  return decodedValue.user as SocketUser;
};

io.use((socket: AuthenticatedSocket, next) => {
  const authToken =
    typeof socket.handshake.auth?.token === "string"
      ? socket.handshake.auth.token
      : undefined;
  const headerToken = getBearerToken(socket.handshake.headers.authorization);
  const token = authToken || headerToken;

  if (!token) {
    next(new Error("Authentication failed: socket token is required"));
    return;
  }

  try {
    socket.data.user = verifySocketToken(token);
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      next(new Error("Authentication failed: token expired"));
      return;
    }

    if (error instanceof JsonWebTokenError) {
      next(new Error(`Authentication failed: ${error.message}`));
      return;
    }

    next(new Error("Authentication failed"));
  }
});

export const getReceiverSocketId = async (
  receiverId: string,
): Promise<string | undefined> => {
  const socketIds = userSocketMap.get(receiverId);
  return socketIds?.values().next().value;
};

export const getUserSocketIds = (userId: string): string[] => {
  return Array.from(userSocketMap.get(userId) ?? []);
};

io.on("connection", async (socket: AuthenticatedSocket) => {
  console.log("User Connected", socket.id);

  const userId = socket.data.user?._id;

  if (userId) {
    const existingSockets = userSocketMap.get(userId) ?? new Set<string>();
    existingSockets.add(socket.id);
    userSocketMap.set(userId, existingSockets);
    console.log(`User ${userId} mapped to socket ${socket.id}`);
  }

  broadcastOnlineUsers();

  if (userId) {
    socket.join(userId);
  }

  socket.on("syncOnlineUsers", async () => {
    socket.emit("getOnlineUser", getOnlineUsers());
  });

  socket.on("typing", (data) => {
    socket.to(data.chatId).emit("userTyping", {
      chatId: data.chatId,
      userId,
    });
  });

  socket.on("stopTyping", (data) => {
    socket.to(data.chatId).emit("userStoppedTyping", {
      chatId: data.chatId,
      userId,
    });
  });

  socket.on("joinChat", (chatId) => {
    socket.join(chatId);
  });

  socket.on("leaveChat", (chatId) => {
    socket.leave(chatId);
  });

  socket.on("disconnect", async () => {
    console.log("User Disconnected", socket.id);
    if (userId) {
      const existingSockets = userSocketMap.get(userId);

      if (existingSockets) {
        existingSockets.delete(socket.id);

        if (existingSockets.size === 0) {
          userSocketMap.delete(userId);
        } else {
          userSocketMap.set(userId, existingSockets);
        }
      }

      broadcastOnlineUsers();
    }
  });
});

export { app, server, io };
