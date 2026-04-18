import type { Request, Response } from "express";
import TryCatch from "../config/tryCatch.js";
import type { AuthenticatedRequest } from "../middleware/isAuth.js";
import { Chat } from "../model/Chat.js";
import { Messages } from "../model/Message.js";
import { UserSnapshot } from "../model/UserSnapshot.js";
import { getUserSocketIds, io } from "../config/socket.js";

type UploadedMessageFile = {
  path?: string;
  filename?: string;
  secure_url?: string;
  url?: string;
  public_id?: string;
  uploadInfo?: { secure_url?: string; public_id?: string };
};

type ChatRequest = Request &
  AuthenticatedRequest & {
    file?: UploadedMessageFile | undefined;
  };

export const createNewChat = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const { otherUserId } = req.body;

    const existingChat = await Chat.findOne({
      users: { $all: [userId, otherUserId], $size: 2 },
    });

    if (existingChat) {
      res.json({
        message: "Chat already existed",
        chatId: existingChat._id,
      });
      return;
    }

    const newChat = await Chat.create({
      users: [userId, otherUserId],
    });
    res.status(201).json({
      message: "New Chat created",
      chatId: newChat._id,
    });
  },
);

export const getAllChats = TryCatch(async (req: ChatRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    res.status(400).json({ message: "UserId missing" });
    return;
  }

  const chats = await Chat.find({ users: userId }).sort({ updatedAt: -1 });

  const chatWithUserData = await Promise.all(
    chats.map(async (chat: (typeof chats)[number]) => {
      const otherUserId = chat.users.find((id: string) => id !== userId);
      const unseenCount = await Messages.countDocuments({
        chatId: chat._id,
        sender: { $ne: userId },
        seen: false,
      });

      const userSnapshot = otherUserId
        ? await UserSnapshot.findById(otherUserId)
        : null;

      return {
        user: userSnapshot ?? { _id: otherUserId, name: "Unknown User" },
        chat: {
          ...chat.toObject(),
          latestMessage: chat.latestMessage || null,
          unseenCount,
        },
      };
    }),
  );

  res.json({ chats: chatWithUserData });
});

export const sendMessage = TryCatch(async (req: ChatRequest, res: Response) => {
  const senderId = req.user?._id;
  const { chatId, text } = req.body as { chatId: string; text?: string };
  const imageFile = req.file;

  if (!senderId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    res.status(400).json({ message: "Chat not found" });
    return;
  }

  const isUserInChat = chat.users.some(
    (id: string) => id.toString() === senderId.toString(),
  );
  if (!isUserInChat) {
    res.status(403).json({ message: "You are not a participant" });
    return;
  }

  const otherUserId = chat.users.find(
    (id: string) => id.toString() !== senderId.toString(),
  );
  if (!otherUserId) {
    res.status(400).json({ message: "No other users" });
    return;
  }

  const receiverSocketIds = getUserSocketIds(otherUserId.toString());
  const isReceiverInChatRoom = receiverSocketIds.some((socketId) => {
    const receiverSocket = io.sockets.sockets.get(socketId);
    return Boolean(receiverSocket && receiverSocket.rooms.has(chatId));
  });

  let messageData: any = {
    chatId,
    sender: senderId,
    seen: isReceiverInChatRoom,
    seenAt: isReceiverInChatRoom ? new Date() : undefined,
  };

  if (imageFile) {
    const imageUrl =
      imageFile.path ||
      imageFile.secure_url ||
      imageFile.url ||
      (imageFile.uploadInfo && imageFile.uploadInfo.secure_url);

    const publicId =
      imageFile.filename ||
      imageFile.public_id ||
      (imageFile.uploadInfo && imageFile.uploadInfo.public_id);

    if (imageUrl) {
      messageData.image = { url: imageUrl, publicId: publicId || "" };
      messageData.messageType = "image";
      messageData.text = text || "";
    } else {
      messageData.text = text;
      messageData.messageType = "text";
    }
  } else {
    messageData.text = text;
    messageData.messageType = "text";
  }

  const message = new Messages(messageData);
  const savedMessage = await message.save();

  await Chat.findByIdAndUpdate(
    chatId,
    {
      latestMessage: { text: imageFile ? "Image" : text, sender: senderId },
      updatedAt: new Date(),
    },
    { new: true },
  );

  io.to(chatId).emit("newMessage", savedMessage);
  io.to(otherUserId.toString()).emit("newMessage", savedMessage);
  io.to(senderId.toString()).emit("newMessage", savedMessage);

  if (isReceiverInChatRoom) {
    io.to(senderId.toString()).emit("messagesSeen", {
      chatId,
      seenBy: otherUserId,
      messageIds: [savedMessage._id],
    });
  }

  res.status(201).json({ message: savedMessage, sender: senderId });
});

export const getMessageByChat = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const { chatId } = req.params as { chatId: string };

    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      res.status(400).json({ message: "Chat not found" });
      return;
    }

    const isUserInChat = chat.users.some(
      (id: string) => id.toString() === userId.toString(),
    );
    if (!isUserInChat) {
      res.status(403).json({ message: "You are not a participant" });
      return;
    }

    const messagesToMarkSeen = await Messages.find({
      chatId,
      sender: { $ne: userId },
      seen: false,
    });

    await Messages.updateMany(
      { chatId, sender: { $ne: userId }, seen: false },
      { seen: true, seenAt: new Date() },
    );

    const messages = await Messages.find({ chatId }).sort({ createdAt: 1 });
    const otherUserId = chat.users.find((id: string) => id !== userId);

    if (messagesToMarkSeen.length > 0) {
      if (otherUserId) {
        io.to(otherUserId?.toString() || "").emit("messagesSeen", {
          chatId,
          seenBy: userId,
          messageIds: messagesToMarkSeen.map(
            (msg: (typeof messagesToMarkSeen)[number]) => msg._id,
          ),
        });
      }
    }

    const userSnapshot = otherUserId
      ? await UserSnapshot.findById(otherUserId)
      : null;

    res.json({
      messages,
      user: userSnapshot ?? { _id: otherUserId, name: "Unknown User" },
    });
  },
);
