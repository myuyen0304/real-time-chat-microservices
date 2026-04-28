import type { Request, Response } from "express";
import TryCatch from "../config/tryCatch.js";
import { chatEnv } from "../config/env.js";
import { evictCallSignalCache, getUserSocketIds, io } from "../config/socket.js";
import type { AuthenticatedRequest } from "../middleware/isAuth.js";
import { Chat } from "../model/Chat.js";
import { Call } from "../model/Call.js";
import { UserSnapshot } from "../model/UserSnapshot.js";
import {
  ACTIVE_CALL_STATUSES,
  finalizeCall,
  findActiveCallForUser,
  getCallParticipantIds,
  serializeCall,
} from "../call/helpers.js";
import { clearCallRingTimeout, setCallRingTimeout } from "../call/timeouts.js";

type CallRequest = Request &
  AuthenticatedRequest & {
    body: {
      chatId?: string;
    };
    params: {
      callId?: string;
    };
  };

type SocketSafeUser = {
  _id: string;
  name: string;
  email: string;
};

const respondSuccess = (
  res: Response,
  message: string,
  data?: Record<string, unknown>,
  statusCode = 200,
) => {
  res.status(statusCode).json({
    success: true,
    message,
    ...(data ?? {}),
  });
};

const respondError = (
  res: Response,
  statusCode: number,
  message: string,
  extra?: Record<string, unknown>,
) => {
  res.status(statusCode).json({
    success: false,
    message,
    ...(extra ?? {}),
  });
};

const respondUnauthorized = (res: Response) => {
  respondError(res, 401, "Please login");
};

const respondForbidden = (
  res: Response,
  message = "You are not a participant",
) => {
  respondError(res, 403, message);
};

const respondNotFound = (res: Response, resource: string) => {
  respondError(res, 404, `${resource} not found`);
};

const emitCallEvent = (
  participantIds: string[],
  event: string,
  payload: Record<string, unknown>,
) => {
  participantIds.forEach((participantId) => {
    io.to(participantId).emit(event, payload);
  });
};

const emitCallSummaryMessage = (
  callId: string,
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
  io.to(chatId).emit("call:history", { callId });
};

const serializePeer = (
  user: Pick<SocketSafeUser, "_id" | "name" | "email"> | null,
  fallbackId?: string,
) => {
  if (user) {
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
    };
  }

  return {
    _id: fallbackId ?? "unknown-user",
    name: "Unknown user",
    email: "",
  };
};

const getParticipantInfo = async (userId: string) => {
  return UserSnapshot.findById(userId);
};

const scheduleMissedCallTimeout = (callId: string) => {
  clearCallRingTimeout(callId);

  const timeout = setTimeout(async () => {
    const result = await finalizeCall({
      callId,
      status: "missed",
      endReason: "missed",
      expectedCurrentStatuses: ["ringing"],
    });

    if (!result.call || !result.changed) {
      return;
    }

    await evictCallSignalCache(callId);
    const participantIds = getCallParticipantIds(result.call);
    emitCallEvent(participantIds, "call:ended", {
      call: serializeCall(result.call),
      reason: result.call.endReason,
    });
    emitCallSummaryMessage(
      result.call._id.toString(),
      result.call.chatId.toString(),
      participantIds,
      result.summaryMessage,
    );
    clearCallRingTimeout(callId);
  }, chatEnv.CALL_RING_TIMEOUT_SECONDS * 1000);

  setCallRingTimeout(callId, timeout);
};

const isParticipantInChat = (chatUsers: string[], userId: string): boolean => {
  return chatUsers.some(
    (participantId) => participantId.toString() === userId.toString(),
  );
};

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code: unknown }).code === 11000;

export const initiateVideoCall = TryCatch(
  async (req: CallRequest, res: Response) => {
    const user = req.user;
    const chatId = req.body.chatId;

    if (!user?._id) {
      respondUnauthorized(res);
      return;
    }

    if (!chatId) {
      respondError(res, 422, "Chat id is required");
      return;
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      respondNotFound(res, "Chat");
      return;
    }

    if (!isParticipantInChat(chat.users, user._id)) {
      respondForbidden(res);
      return;
    }

    const recipientId = chat.users.find(
      (participantId: string) =>
        participantId.toString() !== user._id.toString(),
    );

    if (!recipientId) {
      respondError(res, 422, "Chat must contain exactly two participants");
      return;
    }

    const [callerActiveCall, recipientActiveCall] = await Promise.all([
      findActiveCallForUser(user._id.toString()),
      findActiveCallForUser(recipientId.toString()),
    ]);

    if (callerActiveCall) {
      respondError(res, 409, "You already have an active call", {
        call: serializeCall(callerActiveCall),
      });
      return;
    }

    if (recipientActiveCall) {
      respondError(res, 409, "Recipient is already in another call", {
        call: serializeCall(recipientActiveCall),
      });
      return;
    }

    const recipientSocketIds = await getUserSocketIds(recipientId.toString());
    if (recipientSocketIds.length === 0) {
      respondError(res, 409, "Recipient is offline");
      return;
    }

    let call;
    try {
      call = await Call.create({
        chatId,
        initiatorId: user._id,
        recipientId,
        participants: [user._id, recipientId],
        mode: "video",
        status: "ringing",
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        respondError(res, 409, "One of the participants already has an active call");
        return;
      }
      throw error;
    }

    const recipient = await getParticipantInfo(recipientId.toString());

    scheduleMissedCallTimeout(call._id.toString());

    const payload = {
      call: serializeCall(call),
      caller: serializePeer(user),
      recipient: serializePeer(recipient, recipientId.toString()),
    };

    io.to(user._id.toString()).emit("call:outgoing", payload);
    io.to(recipientId.toString()).emit("call:incoming", payload);

    respondSuccess(
      res,
      "Video call started",
      {
        call: serializeCall(call),
        peer: serializePeer(recipient, recipientId.toString()),
      },
      201,
    );
  },
);

export const acceptVideoCall = TryCatch(
  async (req: CallRequest, res: Response) => {
    const user = req.user;
    const callId = req.params.callId;

    if (!user?._id) {
      respondUnauthorized(res);
      return;
    }

    if (!callId) {
      respondError(res, 422, "Call id is required");
      return;
    }

    const call = await Call.findById(callId);
    if (!call) {
      respondNotFound(res, "Call");
      return;
    }

    if (!getCallParticipantIds(call).includes(user._id.toString())) {
      respondForbidden(res);
      return;
    }

    if (call.recipientId.toString() !== user._id.toString()) {
      respondForbidden(res, "Only the recipient can accept this call");
      return;
    }

    const result = await finalizeCall({
      callId,
      status: "accepted",
      expectedCurrentStatuses: ["ringing"],
    });

    if (!result.call) {
      respondNotFound(res, "Call");
      return;
    }

    if (!result.changed) {
      respondError(res, 409, "Call can no longer be accepted", {
        call: serializeCall(result.call),
      });
      return;
    }

    clearCallRingTimeout(callId);

    const participantIds = getCallParticipantIds(result.call);
    emitCallEvent(participantIds, "call:accepted", {
      call: serializeCall(result.call),
      acceptedBy: user._id,
    });

    respondSuccess(res, "Video call accepted", {
      call: serializeCall(result.call),
    });
  },
);

export const declineVideoCall = TryCatch(
  async (req: CallRequest, res: Response) => {
    const user = req.user;
    const callId = req.params.callId;

    if (!user?._id) {
      respondUnauthorized(res);
      return;
    }

    if (!callId) {
      respondError(res, 422, "Call id is required");
      return;
    }

    const call = await Call.findById(callId);
    if (!call) {
      respondNotFound(res, "Call");
      return;
    }

    if (!getCallParticipantIds(call).includes(user._id.toString())) {
      respondForbidden(res);
      return;
    }

    if (call.recipientId.toString() !== user._id.toString()) {
      respondForbidden(res, "Only the recipient can decline this call");
      return;
    }

    const result = await finalizeCall({
      callId,
      status: "declined",
      endedBy: user._id,
      endReason: "declined",
      expectedCurrentStatuses: ["ringing"],
    });

    if (!result.call) {
      respondNotFound(res, "Call");
      return;
    }

    if (!result.changed) {
      respondError(res, 409, "Call can no longer be declined", {
        call: serializeCall(result.call),
      });
      return;
    }

    clearCallRingTimeout(callId);
    await evictCallSignalCache(callId);

    const participantIds = getCallParticipantIds(result.call);
    emitCallEvent(participantIds, "call:declined", {
      call: serializeCall(result.call),
      declinedBy: user._id,
    });
    emitCallSummaryMessage(
      result.call._id.toString(),
      result.call.chatId.toString(),
      participantIds,
      result.summaryMessage,
    );

    respondSuccess(res, "Video call declined", {
      call: serializeCall(result.call),
    });
  },
);

export const endVideoCall = TryCatch(
  async (req: CallRequest, res: Response) => {
    const user = req.user;
    const callId = req.params.callId;

    if (!user?._id) {
      respondUnauthorized(res);
      return;
    }

    if (!callId) {
      respondError(res, 422, "Call id is required");
      return;
    }

    const call = await Call.findById(callId);
    if (!call) {
      respondNotFound(res, "Call");
      return;
    }

    if (!getCallParticipantIds(call).includes(user._id.toString())) {
      respondForbidden(res);
      return;
    }

    const targetStatus = call.status === "ringing" ? "cancelled" : "ended";
    const endReason = targetStatus === "cancelled" ? "cancelled" : "hangup";

    const result = await finalizeCall({
      callId,
      status: targetStatus,
      endedBy: user._id,
      endReason,
      expectedCurrentStatuses: ["ringing", "accepted"],
    });

    if (!result.call) {
      respondNotFound(res, "Call");
      return;
    }

    if (!result.changed) {
      respondError(res, 409, "Call has already finished", {
        call: serializeCall(result.call),
      });
      return;
    }

    clearCallRingTimeout(callId);
    await evictCallSignalCache(callId);

    const participantIds = getCallParticipantIds(result.call);
    emitCallEvent(participantIds, "call:ended", {
      call: serializeCall(result.call),
      endedBy: user._id,
      reason: endReason,
    });
    emitCallSummaryMessage(
      result.call._id.toString(),
      result.call.chatId.toString(),
      participantIds,
      result.summaryMessage,
    );

    respondSuccess(res, "Video call ended", {
      call: serializeCall(result.call),
    });
  },
);
