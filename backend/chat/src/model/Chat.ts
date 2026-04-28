import mongoose, { Document, Schema } from "mongoose";

export type ChatType = "direct" | "group";

export interface IChat extends Document {
  chatType: ChatType;
  users: string[];
  groupAdmins: string[];
  groupName?: string;
  groupAvatar?: string;
  latestMessage?: {
    text: string;
    sender: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema: Schema<IChat> = new Schema(
  {
    chatType: {
      type: String,
      enum: ["direct", "group"],
      default: "direct",
      required: true,
    },
    users: [{ type: String, required: true }],
    groupAdmins: {
      type: [{ type: String, required: true }],
      default: [],
    },
    groupName: {
      type: String,
      trim: true,
    },
    groupAvatar: {
      type: String,
      trim: true,
    },
    latestMessage: {
      text: String,
      sender: String,
    },
  },
  { timestamps: true },
);

export const Chat = mongoose.model<IChat>("Chat", schema);
