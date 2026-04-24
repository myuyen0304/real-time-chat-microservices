import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { chatEnv } from "./env.js";
import { Call } from "../model/Call.js";
import {
  finalizeCall,
  getCallParticipantIds,
  isActiveCallStatus,
  serializeCall,
} from "../call/helpers.js";
import { clearCallRingTimeout } from "../call/timeouts.js";

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

const emitCallSummaryMessage = (
  chatId: string,
  participantIds: string[],
  summaryMessage: unknown,
) => {
  if (!summaryMessage) {
    return;
  }

  io.to(chatId).emit("newMessage", summaryMessage);
  participantIds.forEach((participantId) => {
    io.to(participantId).emit("newMessage", summaryMessage);
  });
};

const relayCallSignal = async ({
  socketUserId,
  callId,
  event,
  payload,
}: {
  socketUserId: string;
  callId: string;
  event:
    | "call:signal:offer"
    | "call:signal:answer"
    | "call:signal:ice-candidate";
  payload: Record<string, unknown>;
}) => {
  const call = await Call.findById(callId);

  if (!call) {
    return;
  }

  if (!getCallParticipantIds(call).includes(socketUserId)) {
    return;
  }

  if (!isActiveCallStatus(call.status)) {
    return;
  }

  const recipientId = getCallParticipantIds(call).find(
    (participantId) => participantId !== socketUserId,
  );

  if (!recipientId) {
    return;
  }

  io.to(recipientId).emit(event, {
    callId,
    fromUserId: socketUserId,
    ...payload,
  });
};

const handleDisconnectedCalls = async (userId: string) => {
  const activeCalls = await Call.find({
    participants: userId,
    status: { $in: ["ringing", "accepted"] },
  });

  for (const activeCall of activeCalls) {
    const targetStatus =
      activeCall.status === "ringing" ? "cancelled" : "ended";
    const endReason =
      activeCall.status === "ringing" ? "cancelled" : "disconnect";

    const result = await finalizeCall({
      callId: activeCall._id.toString(),
      status: targetStatus,
      endedBy: userId,
      endReason,
      expectedCurrentStatuses: ["ringing", "accepted"],
    });

    const finalizedCall = result.call;

    if (!finalizedCall || !result.changed) {
      continue;
    }

    clearCallRingTimeout(finalizedCall._id.toString());

    const participantIds = getCallParticipantIds(finalizedCall);
    participantIds.forEach((participantId) => {
      io.to(participantId).emit("call:ended", {
        call: serializeCall(finalizedCall),
        endedBy: userId,
        reason: endReason,
      });
    });
    emitCallSummaryMessage(
      finalizedCall.chatId.toString(),
      participantIds,
      result.summaryMessage,
    );
  }
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

  socket.on("call:signal:offer", async (data: unknown) => {
    const callId =
      typeof data === "object" &&
      data !== null &&
      "callId" in data &&
      typeof data.callId === "string"
        ? data.callId
        : null;

    if (!userId || !callId) {
      return;
    }

    const payload =
      typeof data === "object" && data !== null && "sdp" in data
        ? { sdp: data.sdp }
        : {};

    await relayCallSignal({
      socketUserId: userId,
      callId,
      event: "call:signal:offer",
      payload,
    });
  });

  socket.on("call:signal:answer", async (data: unknown) => {
    const callId =
      typeof data === "object" &&
      data !== null &&
      "callId" in data &&
      typeof data.callId === "string"
        ? data.callId
        : null;

    if (!userId || !callId) {
      return;
    }

    const payload =
      typeof data === "object" && data !== null && "sdp" in data
        ? { sdp: data.sdp }
        : {};

    await relayCallSignal({
      socketUserId: userId,
      callId,
      event: "call:signal:answer",
      payload,
    });
  });

  socket.on("call:signal:ice-candidate", async (data: unknown) => {
    const callId =
      typeof data === "object" &&
      data !== null &&
      "callId" in data &&
      typeof data.callId === "string"
        ? data.callId
        : null;

    if (!userId || !callId) {
      return;
    }

    const payload =
      typeof data === "object" && data !== null && "candidate" in data
        ? { candidate: data.candidate }
        : {};

    await relayCallSignal({
      socketUserId: userId,
      callId,
      event: "call:signal:ice-candidate",
      payload,
    });
  });

  socket.on("disconnect", async () => {
    console.log("User Disconnected", socket.id);
    if (userId) {
      const existingSockets = userSocketMap.get(userId);
      let shouldFinalizeCalls = false;

      if (existingSockets) {
        existingSockets.delete(socket.id);

        if (existingSockets.size === 0) {
          userSocketMap.delete(userId);
          shouldFinalizeCalls = true;
        } else {
          userSocketMap.set(userId, existingSockets);
        }
      }

      broadcastOnlineUsers();

      if (shouldFinalizeCalls) {
        await handleDisconnectedCalls(userId);
      }
    }
  });
});

export { app, server, io };
