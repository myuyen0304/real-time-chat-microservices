import type { Request, Response } from "express";
import TryCatch from "../config/tryCatch.js";
import type { AuthenticatedRequest } from "../middleware/isAuth.js";
import { Chat } from "../model/Chat.js";
import { Messages } from "../model/Message.js";
import { UserSnapshot } from "../model/UserSnapshot.js";
import { io } from "../config/socket.js";

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

type DirectCreateChatBody = {
  chatType?: "direct";
  otherUserId: string;
};

type GroupCreateChatBody = {
  chatType: "group";
  groupName: string;
  groupAvatar?: string;
  userIds: string[];
};

type CreateChatBody = DirectCreateChatBody | GroupCreateChatBody;

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

type ChatParticipant = {
  _id: string;
  name: string;
  email: string;
};

type ReadReceipt = {
  userId: string;
  readAt: Date;
};

type MessageLike = {
  _id: unknown;
  sender: string;
  readBy?: ReadReceipt[];
  seen?: boolean;
  seenAt?: Date | null;
  toObject?: () => Record<string, unknown>;
};

const buildUnknownParticipant = (participantId: string): ChatParticipant => ({
  _id: participantId,
  name: "Unknown User",
  email: "",
});

const getChatParticipants = async (
  participantIds: string[],
): Promise<ChatParticipant[]> => {
  const docs = await UserSnapshot.find({ _id: { $in: participantIds } });
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));
  return participantIds.map((id) => byId.get(id) ?? buildUnknownParticipant(id));
};

const isParticipantInChatRoom = async (
  participantId: string,
  chatId: string,
) => {
  const roomSockets = await io.in(chatId).fetchSockets();
  return roomSockets.some(
    (socket) => socket.data.user?._id?.toString() === participantId,
  );
};

const hasReadReceipt = (message: MessageLike, userId: string) => {
  return Boolean(
    message.readBy?.some((receipt) => receipt.userId.toString() === userId),
  );
};

const haveAllReceiversRead = (
  message: MessageLike,
  participantIds: string[],
) => {
  const receiverIds = participantIds.filter(
    (participantId) => participantId !== message.sender.toString(),
  );

  return receiverIds.every((receiverId) => hasReadReceipt(message, receiverId));
};

const toClientMessage = (message: MessageLike, participantIds: string[]) => {
  const rawMessage = message.toObject ? message.toObject() : message;
  const seen = haveAllReceiversRead(message, participantIds);
  const lastReadReceipt = message.readBy?.[message.readBy.length - 1];

  return {
    ...rawMessage,
    seen,
    seenAt: seen ? (message.seenAt ?? lastReadReceipt?.readAt) : null,
  };
};

const buildUnreadMessageQuery = (chatId: unknown, userId: string) => ({
  chatId,
  sender: { $ne: userId },
  readBy: { $not: { $elemMatch: { userId } } },
});

export const createNewChat = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const payload = req.body as CreateChatBody;

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    if (payload.chatType === "group") {
      const participantIds = Array.from(
        new Set([userId.toString(), ...payload.userIds]),
      );
      const participants = await Promise.all(
        participantIds.map((participantId) =>
          UserSnapshot.findById(participantId),
        ),
      );

      if (participants.some((participant) => !participant)) {
        respondNotFound(res, "Group member");
        return;
      }

      const newChat = await Chat.create({
        chatType: "group",
        users: participantIds,
        groupName: payload.groupName,
        groupAvatar: payload.groupAvatar,
      });

      respondSuccess(
        res,
        "New chat created",
        {
          chatId: newChat._id,
        },
        201,
      );
      return;
    }

    const { otherUserId } = payload;

    const otherUser = await UserSnapshot.findById(otherUserId);
    if (!otherUser) {
      respondNotFound(res, "Other user");
      return;
    }

    // Also matches legacy documents that pre-date the chatType field
    const existingChat = await Chat.findOne({
      $or: [{ chatType: "direct" }, { chatType: { $exists: false } }],
      users: { $all: [userId, otherUserId], $size: 2 },
    });

    if (existingChat) {
      respondError(res, 409, "Chat already existed", {
        chatId: existingChat._id,
      });
      return;
    }

    const newChat = await Chat.create({
      chatType: "direct",
      users: [userId, otherUserId],
    });
    respondSuccess(
      res,
      "New chat created",
      {
        chatId: newChat._id,
      },
      201,
    );
  },
);

export const getAllChats = TryCatch(async (req: ChatRequest, res: Response) => {
  const userId = req.user?._id;
  if (!userId) {
    respondUnauthorized(res);
    return;
  }

  const chats = await Chat.find({ users: userId }).sort({ updatedAt: -1 });

  const chatsWithParticipants = await Promise.all(
    chats.map(async (chat: (typeof chats)[number]) => {
      const unseenCount = await Messages.countDocuments(
        buildUnreadMessageQuery(chat._id, userId),
      );
      const participants = await getChatParticipants(chat.users);

      return {
        participants,
        chat: {
          ...chat.toObject(),
          latestMessage: chat.latestMessage || null,
          unseenCount,
        },
      };
    }),
  );

  respondSuccess(res, "Chats fetched", { chats: chatsWithParticipants });
});

export const sendMessage = TryCatch(async (req: ChatRequest, res: Response) => {
  const senderId = req.user?._id;
  const { chatId, text } = req.body as { chatId: string; text?: string };
  const imageFile = req.file;

  if (!senderId) {
    respondUnauthorized(res);
    return;
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    respondNotFound(res, "Chat");
    return;
  }

  const isUserInChat = chat.users.some(
    (id: string) => id.toString() === senderId.toString(),
  );
  if (!isUserInChat) {
    respondForbidden(res);
    return;
  }

  const receiverIds = chat.users.filter(
    (id: string) => id.toString() !== senderId.toString(),
  );
  if (receiverIds.length === 0) {
    respondError(res, 422, "Chat must contain at least two participants");
    return;
  }

  const readAt = new Date();
  const receiverRoomStates = await Promise.all(
    receiverIds.map(async (receiverId: string) => ({
      receiverId,
      isInRoom: await isParticipantInChatRoom(receiverId.toString(), chatId),
    })),
  );
  const receiverIdsInRoom = receiverRoomStates
    .filter(({ isInRoom }) => isInRoom)
    .map(({ receiverId }) => receiverId);
  const areReceiversInChatRoom = receiverIdsInRoom.length === receiverIds.length;
  const readBy = [
    { userId: senderId.toString(), readAt },
    ...receiverIdsInRoom.map((receiverId: string) => ({
      userId: receiverId.toString(),
      readAt,
    })),
  ];

  let messageData: any = {
    chatId,
    sender: senderId,
    readBy,
    seen: areReceiversInChatRoom,
    seenAt: areReceiversInChatRoom ? readAt : undefined,
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
  const clientMessage = toClientMessage(savedMessage, chat.users);

  await Chat.findByIdAndUpdate(
    chatId,
    {
      latestMessage: { text: imageFile ? "Image" : text, sender: senderId },
      updatedAt: new Date(),
    },
    { new: true },
  );

  io.to(chatId).emit("newMessage", clientMessage);
  receiverIds.forEach((receiverId: string) => {
    io.to(receiverId.toString()).emit("newMessage", clientMessage);
  });
  io.to(senderId.toString()).emit("newMessage", clientMessage);

  if (areReceiversInChatRoom) {
    io.to(senderId.toString()).emit("messagesSeen", {
      chatId,
      seenBy: receiverIds.length === 1 ? receiverIds[0] : receiverIds,
      messageIds: [savedMessage._id],
    });
  }

  respondSuccess(
    res,
    "Message sent",
    { message: clientMessage, sender: senderId },
    201,
  );
});

export const getMessageByChat = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const { chatId } = req.params as { chatId: string };

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      respondNotFound(res, "Chat");
      return;
    }

    const isUserInChat = chat.users.some(
      (id: string) => id.toString() === userId.toString(),
    );
    if (!isUserInChat) {
      respondForbidden(res);
      return;
    }

    const unreadMessageQuery = buildUnreadMessageQuery(chatId, userId);
    const messagesToMarkSeen = await Messages.find(unreadMessageQuery);
    const readAt = new Date();

    await Messages.updateMany(unreadMessageQuery, {
      $addToSet: { readBy: { userId, readAt } },
      $set: { seenAt: readAt },
    });

    const messages = await Messages.find({ chatId }).sort({ createdAt: 1 });
    const otherParticipantIds = chat.users.filter(
      (id: string) => id !== userId,
    );

    if (messagesToMarkSeen.length > 0) {
      otherParticipantIds.forEach((participantId) => {
        io.to(participantId.toString()).emit("messagesSeen", {
          chatId,
          seenBy: userId,
          messageIds: messagesToMarkSeen.map(
            (msg: (typeof messagesToMarkSeen)[number]) => msg._id,
          ),
        });
      });
    }

    const participants = await getChatParticipants(chat.users);
    const clientMessages = messages.map((message) =>
      toClientMessage(message, chat.users),
    );

    respondSuccess(res, "Messages fetched", {
      messages: clientMessages,
      participants,
      chat: {
        ...chat.toObject(),
        latestMessage: chat.latestMessage || null,
      },
    });
  },
);
