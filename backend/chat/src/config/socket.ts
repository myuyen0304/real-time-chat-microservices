import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);
const userSocketMap = new Map<string, Set<string>>();

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const pubClient = createClient({ url: process.env.REDIS_URL as string });
const subClient = pubClient.duplicate();

const getOnlineUsers = (): string[] => Array.from(userSocketMap.keys());

const broadcastOnlineUsers = () => {
  io.emit("getOnlineUser", getOnlineUsers());
};

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log("Socket.IO Redis adapter connected");
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

io.on("connection", async (socket: Socket) => {
  console.log("User Connected", socket.id);

  const userId = socket.handshake.query.userId as string | undefined;

  if (userId && userId !== "undefined") {
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
      userId: data.userId,
    });
  });

  socket.on("stopTyping", (data) => {
    socket.to(data.chatId).emit("userStoppedTyping", {
      chatId: data.chatId,
      userId: data.userId,
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
