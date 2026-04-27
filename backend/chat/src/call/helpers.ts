import { Call, type CallDocument } from "../model/Call.js";
import { Chat } from "../model/Chat.js";
import { Messages, type CallMessagePayload } from "../model/Message.js";

export const ACTIVE_CALL_STATUSES = ["ringing", "accepted"] as const;
export const TERMINAL_CALL_STATUSES = [
  "declined",
  "missed",
  "ended",
  "cancelled",
] as const;
export const CALL_END_REASONS = [
  "declined",
  "missed",
  "hangup",
  "disconnect",
  "cancelled",
] as const;

export type ActiveCallStatus = (typeof ACTIVE_CALL_STATUSES)[number];
export type TerminalCallStatus = (typeof TERMINAL_CALL_STATUSES)[number];
export type CallStatus = ActiveCallStatus | TerminalCallStatus;
export type CallEndReason = (typeof CALL_END_REASONS)[number];
type TerminalCallDocument = CallDocument & { status: TerminalCallStatus };

type FinalizeCallOptions = {
  callId: string;
  status: CallStatus;
  endedBy?: string;
  endReason?: CallEndReason;
  expectedCurrentStatuses?: CallStatus[];
};

const isTerminalCallStatus = (
  status: CallStatus,
): status is TerminalCallStatus => {
  return TERMINAL_CALL_STATUSES.includes(status as TerminalCallStatus);
};

export const isActiveCallStatus = (
  status: CallStatus,
): status is ActiveCallStatus => {
  return ACTIVE_CALL_STATUSES.includes(status as ActiveCallStatus);
};

export const getCallParticipantIds = (
  call: Pick<CallDocument, "initiatorId" | "recipientId">,
): string[] => {
  return [call.initiatorId.toString(), call.recipientId.toString()];
};

export const getOtherParticipantId = (
  call: Pick<CallDocument, "initiatorId" | "recipientId">,
  userId: string,
): string | null => {
  const participants = getCallParticipantIds(call);
  return participants.find((participantId) => participantId !== userId) ?? null;
};

export const serializeCall = (call: CallDocument) => {
  return {
    _id: call._id.toString(),
    chatId: call.chatId.toString(),
    initiatorId: call.initiatorId.toString(),
    recipientId: call.recipientId.toString(),
    participants: call.participants.map((participantId) =>
      participantId.toString(),
    ),
    mode: call.mode,
    status: call.status,
    endReason: call.endReason ?? null,
    startedAt: call.startedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSeconds: call.durationSeconds ?? null,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
  };
};

export const buildCallSummaryText = ({
  status,
  durationSeconds,
}: {
  status: CallStatus;
  durationSeconds?: number | null;
}): string => {
  if (status === "missed") {
    return "Missed video call";
  }

  if (status === "declined") {
    return "Video call declined";
  }

  if (status === "cancelled") {
    return "Video call cancelled";
  }

  if (status === "ended" && durationSeconds && durationSeconds > 0) {
    return `Video call ended (${formatCallDuration(durationSeconds)})`;
  }

  return "Video call ended";
};

export const formatCallDuration = (durationSeconds: number): string => {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const findActiveCallForUser = async (
  userId: string,
  excludeCallId?: string,
): Promise<CallDocument | null> => {
  const query: Record<string, unknown> = {
    participants: userId,
    status: { $in: ACTIVE_CALL_STATUSES },
  };

  if (excludeCallId) {
    query._id = { $ne: excludeCallId };
  }

  return Call.findOne(query);
};

const buildCallMessagePayload = (
  call: TerminalCallDocument,
): CallMessagePayload => {
  const payload: CallMessagePayload = {
    callId: call._id.toString(),
    mode: call.mode,
    status: call.status,
    initiatedBy: call.initiatorId.toString(),
  };

  if (call.endReason) {
    payload.endReason = call.endReason;
  }

  if (typeof call.durationSeconds === "number") {
    payload.durationSeconds = call.durationSeconds;
  }

  if (call.startedAt) {
    payload.startedAt = call.startedAt;
  }

  if (call.endedAt) {
    payload.endedAt = call.endedAt;
  }

  if (call.endedBy) {
    payload.endedBy = call.endedBy.toString();
  }

  return payload;
};

const createCallSummaryMessage = async (call: CallDocument) => {
  if (!isTerminalCallStatus(call.status)) {
    throw new Error("Cannot create a summary message for a non-terminal call");
  }

  const terminalCall = call as TerminalCallDocument;
  const summaryText = buildCallSummaryText({
    status: terminalCall.status,
    durationSeconds: terminalCall.durationSeconds ?? null,
  });

  const message = new Messages({
    chatId: call.chatId,
    sender: call.endedBy?.toString() || call.initiatorId.toString(),
    text: summaryText,
    messageType: "call",
    seen: true,
    seenAt: new Date(),
    call: buildCallMessagePayload(terminalCall),
  });
  const savedMessage = await message.save();

  await Chat.findByIdAndUpdate(
    call.chatId,
    {
      latestMessage: {
        text: summaryText,
        sender: call.endedBy?.toString() || call.initiatorId.toString(),
      },
      updatedAt: new Date(),
    },
    { new: true },
  );

  return savedMessage;
};

export const finalizeCall = async ({
  callId,
  status,
  endedBy,
  endReason,
  expectedCurrentStatuses,
}: FinalizeCallOptions): Promise<{
  call: CallDocument | null;
  summaryMessage: Awaited<ReturnType<typeof createCallSummaryMessage>> | null;
  changed: boolean;
}> => {
  const call = await Call.findById(callId);

  if (!call) {
    return { call: null, summaryMessage: null, changed: false };
  }

  if (
    expectedCurrentStatuses &&
    !expectedCurrentStatuses.includes(call.status as CallStatus)
  ) {
    return { call, summaryMessage: null, changed: false };
  }

  if (
    call.status === status &&
    (!isTerminalCallStatus(status) || call.summaryWrittenAt)
  ) {
    return { call, summaryMessage: null, changed: false };
  }

  call.status = status;
  call.updatedAt = new Date();

  if (status === "accepted") {
    call.startedAt = call.startedAt ?? new Date();
    call.endReason = undefined;
    call.endedAt = undefined;
    call.endedBy = undefined;
    call.durationSeconds = undefined;
    await call.save();
    return { call, summaryMessage: null, changed: true };
  }

  if (isTerminalCallStatus(status)) {
    const endedAt = new Date();
    call.endedAt = endedAt;
    call.endReason = endReason;
    call.endedBy = endedBy;

    if (call.startedAt) {
      call.durationSeconds = Math.max(
        0,
        Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000),
      );
    } else {
      call.durationSeconds = 0;
    }

    let summaryMessage = null;

    if (!call.summaryWrittenAt) {
      // Atomic claim: only the request that successfully sets summaryWrittenAt
      // writes the message. Concurrent requests get null back and skip creation.
      const claimed = await Call.findOneAndUpdate(
        { _id: call._id, summaryWrittenAt: { $exists: false } },
        { $set: { summaryWrittenAt: endedAt } },
      );
      if (claimed) {
        summaryMessage = await createCallSummaryMessage(call);
      }
      // Always sync in-memory so the following save() doesn't overwrite
      // the value that was already written to the DB by the winner.
      call.summaryWrittenAt = endedAt;
    }

    await call.save();

    return { call, summaryMessage, changed: true };
  }

  await call.save();
  return { call, summaryMessage: null, changed: true };
};

/**
 * Called once at startup to expire ringing calls that were left open when the
 * server last shut down. Their in-process ring timeouts are gone, so without
 * this they would stay in "ringing" status indefinitely.
 */
export const cleanupStaleRingingCalls = async (
  ringTimeoutSeconds: number,
): Promise<void> => {
  const cutoff = new Date(Date.now() - ringTimeoutSeconds * 1000);

  const staleCalls = await Call.find({
    status: "ringing",
    createdAt: { $lt: cutoff },
  });

  if (staleCalls.length === 0) {
    return;
  }

  console.log(
    `[chat] Marking ${staleCalls.length} stale ringing call(s) as missed`,
  );

  for (const staleCall of staleCalls) {
    try {
      await finalizeCall({
        callId: staleCall._id.toString(),
        status: "missed",
        endReason: "missed",
        expectedCurrentStatuses: ["ringing"],
      });
    } catch (error) {
      console.error(
        `[chat] Failed to clean up stale call ${staleCall._id}`,
        error,
      );
    }
  }
};
