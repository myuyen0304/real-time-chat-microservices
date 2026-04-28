import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { chatEnv } from "./env.js";
import {
  connectSocketRedisClients,
  socketRedisPubClient,
  socketRedisSubClient,
} from "./redis.js";
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
const PRESENCE_SOCKET_TTL_SECONDS = 120;
const PRESENCE_HEARTBEAT_MS = 30_000;
const CALL_PARTICIPANT_CACHE_TTL_SECONDS = 86_400;
const ONLINE_USERS_KEY = "chat:presence:online-users";

const getUserSocketsKey = (userId: string) =>
  `chat:presence:user:${userId}:sockets`;

const getSocketUserKey = (socketId: string) =>
  `chat:presence:socket:${socketId}:user`;

const getCallParticipantsKey = (callId: string) =>
  `chat:call:${callId}:participants`;

interface SocketUser {
  _id: string;
  name: string;
  email: string;
}

interface AuthenticatedSocket extends Socket {
  data: Socket["data"] & { user?: SocketUser };
}

const allowedOrigins = chatEnv.CORS_ORIGIN.split(",").map((s) => s.trim());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

const registerPresence = async (userId: string, socketId: string) => {
  await Promise.all([
    socketRedisPubClient.sAdd(ONLINE_USERS_KEY, userId),
    socketRedisPubClient.sAdd(getUserSocketsKey(userId), socketId),
    socketRedisPubClient.set(getSocketUserKey(socketId), userId, {
      EX: PRESENCE_SOCKET_TTL_SECONDS,
    }),
  ]);
};

const refreshPresence = async (socketId: string) => {
  await socketRedisPubClient.expire(
    getSocketUserKey(socketId),
    PRESENCE_SOCKET_TTL_SECONDS,
  );
};

const removePresence = async (userId: string, socketId: string) => {
  await Promise.all([
    socketRedisPubClient.del(getSocketUserKey(socketId)),
    socketRedisPubClient.sRem(getUserSocketsKey(userId), socketId),
  ]);

  const remainingSocketCount = await socketRedisPubClient.sCard(
    getUserSocketsKey(userId),
  );

  if (remainingSocketCount === 0) {
    await socketRedisPubClient.sRem(ONLINE_USERS_KEY, userId);
  }
};

const pruneStaleUserSockets = async (userId: string): Promise<string[]> => {
  const userSocketsKey = getUserSocketsKey(userId);
  const socketIds = await socketRedisPubClient.sMembers(userSocketsKey);

  if (socketIds.length === 0) {
    await socketRedisPubClient.sRem(ONLINE_USERS_KEY, userId);
    return [];
  }

  const socketUserIds = await Promise.all(
    socketIds.map((socketId) =>
      socketRedisPubClient.get(getSocketUserKey(socketId)),
    ),
  );
  const activeSocketIds = socketIds.filter(
    (socketId, index) => socketUserIds[index] === userId,
  );
  const staleSocketIds = socketIds.filter(
    (socketId) => !activeSocketIds.includes(socketId),
  );

  if (staleSocketIds.length > 0) {
    await socketRedisPubClient.sRem(userSocketsKey, staleSocketIds);
  }

  if (activeSocketIds.length === 0) {
    await socketRedisPubClient.sRem(ONLINE_USERS_KEY, userId);
  }

  return activeSocketIds;
};

const getOnlineUsers = async (): Promise<string[]> => {
  const userIds = await socketRedisPubClient.sMembers(ONLINE_USERS_KEY);
  const activeUserIds = await Promise.all(
    userIds.map(async (userId) => {
      const socketIds = await pruneStaleUserSockets(userId);
      return socketIds.length > 0 ? userId : null;
    }),
  );

  return activeUserIds.filter((userId): userId is string => Boolean(userId));
};

const broadcastOnlineUsers = async () => {
  io.emit("getOnlineUser", await getOnlineUsers());
};

const getCachedCallParticipants = async (
  callId: string,
): Promise<string[] | null> => {
  const cachedParticipantIds = await socketRedisPubClient.get(
    getCallParticipantsKey(callId),
  );

  if (!cachedParticipantIds) {
    return null;
  }

  try {
    const parsedParticipantIds = JSON.parse(cachedParticipantIds);
    return Array.isArray(parsedParticipantIds) &&
      parsedParticipantIds.every(
        (participantId) => typeof participantId === "string",
      )
      ? parsedParticipantIds
      : null;
  } catch {
    await socketRedisPubClient.del(getCallParticipantsKey(callId));
    return null;
  }
};

const cacheCallParticipants = async (
  callId: string,
  participantIds: string[],
) => {
  await socketRedisPubClient.set(
    getCallParticipantsKey(callId),
    JSON.stringify(participantIds),
    { EX: CALL_PARTICIPANT_CACHE_TTL_SECONDS },
  );
};

const evictCachedCallParticipants = async (callId: string) => {
  await socketRedisPubClient.del(getCallParticipantsKey(callId));
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
  let participantIds = await getCachedCallParticipants(callId);

  if (!participantIds) {
    // First signal for this call across the cluster hits the DB once, then
    // stores the participant IDs in Redis for later offer/answer/ICE events.
    const call = await Call.findById(callId);
    if (!call || !isActiveCallStatus(call.status)) {
      return;
    }
    participantIds = getCallParticipantIds(call);
    await cacheCallParticipants(callId, participantIds);
  }

  if (!participantIds.includes(socketUserId)) {
    return;
  }

  const recipientId = participantIds.find((id) => id !== socketUserId);
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
  let activeCalls;

  try {
    activeCalls = await Call.find({
      participants: userId,
      status: { $in: ["ringing", "accepted"] },
    });
  } catch (error) {
    console.error(`[socket] Failed to query active calls for user ${userId} on disconnect`, error);
    return;
  }

  for (const activeCall of activeCalls) {
    try {
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
      await evictCachedCallParticipants(finalizedCall._id.toString());

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
    } catch (error) {
      console.error(`[socket] Failed to finalize call ${activeCall._id} on disconnect`, error);
    }
  }
};

connectSocketRedisClients()
  .then(() => {
    io.adapter(createAdapter(socketRedisPubClient, socketRedisSubClient));
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
  const socketIds = await getUserSocketIds(receiverId);
  return socketIds[0];
};

export const getUserSocketIds = async (userId: string): Promise<string[]> => {
  return pruneStaleUserSockets(userId);
};

export const evictCallSignalCache = async (callId: string): Promise<void> => {
  await evictCachedCallParticipants(callId);
};

io.on("connection", async (socket: AuthenticatedSocket) => {
  console.log("User Connected", socket.id);

  const userId = socket.data.user?._id;
  let presenceHeartbeat: NodeJS.Timeout | undefined;

  if (userId) {
    try {
      await registerPresence(userId, socket.id);
      presenceHeartbeat = setInterval(() => {
        refreshPresence(socket.id).catch((error) => {
          console.error(
            `[socket] Failed to refresh presence for socket ${socket.id}`,
            error,
          );
        });
      }, PRESENCE_HEARTBEAT_MS);
    } catch (error) {
      console.error(
        `[socket] Failed to register presence for user ${userId}`,
        error,
      );
      socket.disconnect(true);
      return;
    }
    console.log(`User ${userId} mapped to socket ${socket.id}`);
  }

  await broadcastOnlineUsers();

  if (userId) {
    socket.join(userId);
  }

  socket.on("syncOnlineUsers", async () => {
    socket.emit("getOnlineUser", await getOnlineUsers());
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
    if (presenceHeartbeat) {
      clearInterval(presenceHeartbeat);
    }

    if (userId) {
      let shouldFinalizeCalls = false;

      try {
        await removePresence(userId, socket.id);
        shouldFinalizeCalls = (await getUserSocketIds(userId)).length === 0;
      } catch (error) {
        console.error(
          `[socket] Failed to remove presence for user ${userId}`,
          error,
        );
      }

      await broadcastOnlineUsers();

      if (shouldFinalizeCalls) {
        try {
          await handleDisconnectedCalls(userId);
        } catch (error) {
          console.error(`[socket] Unexpected error handling disconnected calls for user ${userId}`, error);
        }
      }
    }
  });
});

export { app, server, io };
