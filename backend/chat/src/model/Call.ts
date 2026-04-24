import mongoose, { Schema, Types } from "mongoose";
import type { HydratedDocument } from "mongoose";

export interface CallFields {
  chatId: Types.ObjectId;
  initiatorId: string;
  recipientId: string;
  participants: string[];
  mode: "video";
  status:
    | "ringing"
    | "accepted"
    | "declined"
    | "missed"
    | "ended"
    | "cancelled";
  endReason?:
    | "declined"
    | "missed"
    | "hangup"
    | "disconnect"
    | "cancelled"
    | undefined;
  endedBy?: string | undefined;
  startedAt?: Date | undefined;
  endedAt?: Date | undefined;
  durationSeconds?: number | undefined;
  summaryWrittenAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export type CallDocument = HydratedDocument<CallFields>;

const schema = new Schema<CallFields>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    initiatorId: {
      type: String,
      required: true,
    },
    recipientId: {
      type: String,
      required: true,
    },
    participants: {
      type: [String],
      required: true,
      validate: {
        validator: (participants: string[]) => participants.length === 2,
        message: "Call must contain exactly two participants",
      },
    },
    mode: {
      type: String,
      enum: ["video"],
      default: "video",
    },
    status: {
      type: String,
      enum: ["ringing", "accepted", "declined", "missed", "ended", "cancelled"],
      default: "ringing",
    },
    endReason: {
      type: String,
      enum: ["declined", "missed", "hangup", "disconnect", "cancelled"],
    },
    endedBy: String,
    startedAt: Date,
    endedAt: Date,
    durationSeconds: Number,
    summaryWrittenAt: Date,
  },
  {
    timestamps: true,
  },
);

schema.index({ participants: 1, status: 1 });

export const Call = mongoose.model<CallFields>("Call", schema);
