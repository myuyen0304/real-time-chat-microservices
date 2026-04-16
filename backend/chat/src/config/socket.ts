import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import http from "http";
import express from "express";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const pubClient = createClient({ url: process.env.REDIS_URL as string });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log("Socket.IO Redis adapter connected");
});

export const getReceiverSocketId = async (
  receiverId: string,
): Promise<string | undefined> => {
  const socketId = await pubClient.get(`socket:user:${receiverId}`);
  return socketId ?? undefined;
};

io.on("connection", async (socket: Socket) => {
  console.log("User Connected", socket.id);

  const userId = socket.handshake.query.userId as string | undefined;

  if (userId && userId !== "undefined") {
    await pubClient.set(`socket:user:${userId}`, socket.id);
    console.log(`User ${userId} mapped to socket ${socket.id}`);
  }

  const onlineUserIds: string[] = await pubClient.keys("socket:user:*");
  const onlineUsers = onlineUserIds.map((key) =>
    key.replace("socket:user:", ""),
  );
  io.emit("getOnlineUser", onlineUsers);

  if (userId) {
    socket.join(userId);
  }

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
      await pubClient.del(`socket:user:${userId}`);
      const onlineUserIds: string[] = await pubClient.keys("socket:user:*");
      const onlineUsers = onlineUserIds.map((key) =>
        key.replace("socket:user:", ""),
      );
      io.emit("getOnlineUser", onlineUsers);
    }
  });
});

export { app, server, io };
