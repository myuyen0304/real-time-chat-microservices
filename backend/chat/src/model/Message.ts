import mongoose, { Document, Schema, Types } from "mongoose";

export interface CallMessagePayload {
  callId: string;
  mode: "video";
  status: "declined" | "missed" | "ended" | "cancelled";
  endReason?: "declined" | "missed" | "hangup" | "disconnect" | "cancelled";
  durationSeconds?: number;
  startedAt?: Date;
  endedAt?: Date;
  initiatedBy: string;
  endedBy?: string;
}

export interface IMessage extends Document {
  chatId: Types.ObjectId;
  sender: string;
  text?: string;
  image?: {
    url: string;
    publicId: string;
  };
  call?: CallMessagePayload;
  messageType: "text" | "image" | "call";
  readBy: {
    userId: string;
    readAt: Date;
  }[];
  seen: boolean;
  seenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IMessage>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    sender: {
      type: String,
      required: true,
    },
    text: String,
    image: {
      url: String,
      publicId: String,
    },
    call: {
      callId: String,
      mode: {
        type: String,
        enum: ["video"],
      },
      status: {
        type: String,
        enum: ["declined", "missed", "ended", "cancelled"],
      },
      endReason: {
        type: String,
        enum: ["declined", "missed", "hangup", "disconnect", "cancelled"],
      },
      durationSeconds: Number,
      startedAt: Date,
      endedAt: Date,
      initiatedBy: String,
      endedBy: String,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "call"],
      default: "text",
    },
    readBy: [
      {
        userId: {
          type: String,
          required: true,
        },
        readAt: {
          type: Date,
          required: true,
        },
      },
    ],
    seen: {
      type: Boolean,
      default: false,
    },
    seenAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

schema.index({ chatId: 1, "readBy.userId": 1 });

export const Messages = mongoose.model<IMessage>("Messages", schema);
