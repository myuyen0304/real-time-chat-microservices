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

type UpdateGroupMetadataBody = {
  groupName?: string;
  groupAvatar?: string;
};

type UpdateMessageBody = {
  text: string;
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
  chatId?: unknown;
  sender: string;
  text?: string;
  image?: { url: string; publicId: string };
  call?: unknown;
  messageType?: "text" | "image" | "call";
  readBy?: ReadReceipt[];
  seen?: boolean;
  seenAt?: Date | null;
  editedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt?: Date;
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

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const includesSearchQuery = (value: unknown, normalizedQuery: string) => {
  return (
    typeof value === "string" &&
    value.toLocaleLowerCase().includes(normalizedQuery)
  );
};

const ensureMessageOwnerInChat = (
  res: Response,
  chat: { users: string[] } | null,
  message: MessageLike,
  userId: string,
): chat is { users: string[]; latestMessage?: { text: string; sender: string } | null } => {
  if (!chat) {
    respondNotFound(res, "Chat");
    return false;
  }

  if (!isChatParticipant(chat, userId)) {
    respondForbidden(res);
    return false;
  }

  if (message.sender.toString() !== userId) {
    respondForbidden(res, "Only the sender can change this message");
    return false;
  }

  return true;
};

const isGroupChat = (chat: { chatType?: string }) => chat.chatType === "group";

const isChatParticipant = (
  chat: { users: string[] },
  userId: string,
): boolean => {
  return chat.users.some(
    (participantId) => participantId.toString() === userId.toString(),
  );
};

const isGroupAdmin = (
  chat: { groupAdmins?: string[] },
  userId: string,
): boolean => {
  return Boolean(
    chat.groupAdmins?.some((adminId) => adminId.toString() === userId),
  );
};

const ensureGroupChatAdmin = (
  res: Response,
  chat: { chatType?: string; users: string[]; groupAdmins?: string[] } | null,
  userId: string,
): chat is { chatType: "group"; users: string[]; groupAdmins?: string[] } => {
  if (!chat) {
    respondNotFound(res, "Chat");
    return false;
  }

  if (!isGroupChat(chat)) {
    respondError(res, 422, "Only group chats support member management");
    return false;
  }

  if (!isChatParticipant(chat, userId)) {
    respondForbidden(res);
    return false;
  }

  if (!isGroupAdmin(chat, userId)) {
    respondForbidden(res, "Only group admins can manage members");
    return false;
  }

  return true;
};

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
        groupAdmins: [userId.toString()],
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

export const addGroupMember = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const { chatId } = req.params as { chatId: string };
    const { memberId } = req.body as { memberId: string };

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    const chat = await Chat.findById(chatId);
    if (!ensureGroupChatAdmin(res, chat, userId.toString())) {
      return;
    }

    if (isChatParticipant(chat, memberId)) {
      respondError(res, 409, "User is already a group member");
      return;
    }

    const member = await UserSnapshot.findById(memberId);
    if (!member) {
      respondNotFound(res, "Group member");
      return;
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        users: [...chat.users, memberId],
        updatedAt: new Date(),
      },
      { new: true },
    );

    io.to(chatId).emit("group:memberAdded", {
      chatId,
      member,
      addedBy: userId.toString(),
    });
    io.to(memberId).emit("group:memberAdded", {
      chatId,
      member,
      addedBy: userId.toString(),
    });

    respondSuccess(res, "Group member added", { chat: updatedChat });
  },
);

export const removeGroupMember = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const { chatId, memberId } = req.params as {
      chatId: string;
      memberId: string;
    };

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    const chat = await Chat.findById(chatId);
    if (!ensureGroupChatAdmin(res, chat, userId.toString())) {
      return;
    }

    if (!isChatParticipant(chat, memberId)) {
      respondNotFound(res, "Group member");
      return;
    }

    if (memberId === userId.toString()) {
      respondError(res, 422, "Use leave group to remove yourself");
      return;
    }

    const nextUsers = chat.users.filter(
      (participantId) => participantId.toString() !== memberId,
    );
    const nextGroupAdmins = (chat.groupAdmins ?? []).filter(
      (adminId) => adminId.toString() !== memberId,
    );

    if (nextUsers.length === 0) {
      respondError(res, 422, "Group must contain at least one member");
      return;
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        users: nextUsers,
        groupAdmins: nextGroupAdmins,
        updatedAt: new Date(),
      },
      { new: true },
    );

    io.to(chatId).emit("group:memberRemoved", {
      chatId,
      memberId,
      removedBy: userId.toString(),
    });
    io.to(memberId).emit("group:memberRemoved", {
      chatId,
      memberId,
      removedBy: userId.toString(),
    });

    respondSuccess(res, "Group member removed", { chat: updatedChat });
  },
);

export const leaveGroupChat = TryCatch(
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

    if (!isGroupChat(chat)) {
      respondError(res, 422, "Only group chats can be left");
      return;
    }

    if (!isChatParticipant(chat, userId.toString())) {
      respondForbidden(res);
      return;
    }

    const nextUsers = chat.users.filter(
      (participantId) => participantId.toString() !== userId.toString(),
    );

    if (nextUsers.length === 0) {
      respondError(res, 422, "Group must contain at least one member");
      return;
    }

    const remainingAdmins = (chat.groupAdmins ?? []).filter((adminId) =>
      nextUsers.includes(adminId.toString()),
    );
    const nextGroupAdmins =
      remainingAdmins.length > 0 ? remainingAdmins : [nextUsers[0]];

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        users: nextUsers,
        groupAdmins: nextGroupAdmins,
        updatedAt: new Date(),
      },
      { new: true },
    );

    io.to(chatId).emit("group:memberLeft", {
      chatId,
      memberId: userId.toString(),
      promotedAdminId:
        remainingAdmins.length === 0 ? nextGroupAdmins[0] : undefined,
    });
    io.to(userId.toString()).emit("group:memberLeft", {
      chatId,
      memberId: userId.toString(),
    });

    respondSuccess(res, "Left group chat", { chat: updatedChat });
  },
);

export const updateGroupMetadata = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const { chatId } = req.params as { chatId: string };
    const { groupName, groupAvatar } = req.body as UpdateGroupMetadataBody;

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    const chat = await Chat.findById(chatId);
    if (!ensureGroupChatAdmin(res, chat, userId.toString())) {
      return;
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (groupName !== undefined) {
      update.groupName = groupName;
    }
    if (groupAvatar !== undefined) {
      update.groupAvatar = groupAvatar;
    }

    const updatedChat = await Chat.findByIdAndUpdate(chatId, update, {
      new: true,
    });

    io.to(chatId).emit("group:updated", {
      chatId,
      groupName,
      groupAvatar,
      updatedBy: userId.toString(),
    });

    respondSuccess(res, "Group chat updated", { chat: updatedChat });
  },
);

export const uploadGroupAvatar = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const { chatId } = req.params as { chatId: string };
    const avatarFile = req.file;

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    const chat = await Chat.findById(chatId);
    if (!ensureGroupChatAdmin(res, chat, userId.toString())) {
      return;
    }

    const avatarUrl =
      avatarFile?.path ||
      avatarFile?.secure_url ||
      avatarFile?.url ||
      avatarFile?.uploadInfo?.secure_url;

    if (!avatarUrl) {
      respondError(res, 422, "Group avatar image is required");
      return;
    }

    const updatedChat = await Chat.findByIdAndUpdate(
      chatId,
      {
        groupAvatar: avatarUrl,
        updatedAt: new Date(),
      },
      { new: true },
    );

    io.to(chatId).emit("group:updated", {
      chatId,
      groupAvatar: avatarUrl,
      updatedBy: userId.toString(),
    });

    respondSuccess(res, "Group avatar uploaded", { chat: updatedChat });
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

export const searchChatsAndMessages = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    if (!rawQuery) {
      respondError(res, 422, "Search query is required");
      return;
    }

    const normalizedQuery = rawQuery.toLocaleLowerCase();
    const chats = await Chat.find({ users: userId.toString() }).sort({
      updatedAt: -1,
    });

    const chatResults = await Promise.all(
      chats.map(async (chat: (typeof chats)[number]) => {
        const participants = await getChatParticipants(chat.users);
        const chatObject = {
          ...chat.toObject(),
          latestMessage: chat.latestMessage || null,
        };

        return {
          participants,
          chat: chatObject,
          matches:
            includesSearchQuery(chat.groupName, normalizedQuery) ||
            includesSearchQuery(chat.latestMessage?.text, normalizedQuery) ||
            participants.some(
              (participant) =>
                includesSearchQuery(participant.name, normalizedQuery) ||
                includesSearchQuery(participant.email, normalizedQuery),
            ),
        };
      }),
    );

    const chatIds = chats.map((chat: (typeof chats)[number]) =>
      String(chat._id),
    );
    const chatsById = new Map(
      chatResults.map((result) => [String(result.chat._id), result]),
    );
    const messageQuery = new RegExp(escapeRegExp(rawQuery), "i");
    const messages =
      chatIds.length > 0
        ? await Messages.find({
            chatId: { $in: chatIds },
            text: messageQuery,
          }).sort({ createdAt: -1 })
        : [];

    const messageResults = messages
      .map((message: MessageLike) => {
        const chatId = message.chatId?.toString() ?? "";
        const chatResult = chatsById.get(chatId);

        if (!chatResult) {
          return null;
        }

        return {
          message: toClientMessage(message, chatResult.chat.users as string[]),
          chat: chatResult.chat,
          participants: chatResult.participants,
        };
      })
      .filter((result): result is NonNullable<typeof result> =>
        Boolean(result),
      );

    respondSuccess(res, "Search results fetched", {
      chats: chatResults
        .filter((result) => result.matches)
        .map(({ matches: _matches, ...result }) => result),
      messages: messageResults,
    });
  },
);

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

const getLatestMessageText = (message: MessageLike) => {
  if (message.deletedAt) {
    return "Message deleted";
  }

  if (message.messageType === "image" || message.image) {
    return "Image";
  }

  return message.text || "";
};

const shouldUpdateLatestMessage = (
  chat: { latestMessage?: { text: string; sender: string } | null },
  message: MessageLike,
) => {
  const latestMessage = chat.latestMessage;
  return (
    latestMessage?.sender?.toString() === message.sender.toString() &&
    latestMessage.text === getLatestMessageText(message)
  );
};

export const updateMessage = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const { messageId } = req.params as { messageId: string };
    const { text } = req.body as UpdateMessageBody;

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    const message = await Messages.findById(messageId);
    if (!message) {
      respondNotFound(res, "Message");
      return;
    }

    if (message.deletedAt) {
      respondError(res, 422, "Deleted messages cannot be edited");
      return;
    }

    if (message.messageType === "call") {
      respondError(res, 422, "Call messages cannot be edited");
      return;
    }

    const chat = await Chat.findById(message.chatId);
    if (!ensureMessageOwnerInChat(res, chat, message, userId.toString())) {
      return;
    }

    const editedAt = new Date();
    const syncLatestMessage = shouldUpdateLatestMessage(chat, message);
    const updatedMessage = await Messages.findByIdAndUpdate(
      messageId,
      {
        $set: {
          text,
          editedAt,
          updatedAt: editedAt,
        },
      },
      { new: true },
    );

    if (!updatedMessage) {
      respondNotFound(res, "Message");
      return;
    }

    if (syncLatestMessage) {
      await Chat.findByIdAndUpdate(
        chat._id,
        {
          latestMessage: { text, sender: userId.toString() },
          updatedAt: editedAt,
        },
        { new: true },
      );
    }

    const clientMessage = toClientMessage(updatedMessage, chat.users);

    io.to(message.chatId.toString()).emit("messageUpdated", clientMessage);
    chat.users.forEach((participantId) => {
      io.to(participantId.toString()).emit("messageUpdated", clientMessage);
    });

    respondSuccess(res, "Message updated", { message: clientMessage });
  },
);

export const deleteMessage = TryCatch(
  async (req: ChatRequest, res: Response) => {
    const userId = req.user?._id;
    const { messageId } = req.params as { messageId: string };

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    const message = await Messages.findById(messageId);
    if (!message) {
      respondNotFound(res, "Message");
      return;
    }

    if (message.deletedAt) {
      respondError(res, 422, "Message is already deleted");
      return;
    }

    const chat = await Chat.findById(message.chatId);
    if (!ensureMessageOwnerInChat(res, chat, message, userId.toString())) {
      return;
    }

    const deletedAt = new Date();
    const syncLatestMessage = shouldUpdateLatestMessage(chat, message);
    const updatedMessage = await Messages.findByIdAndUpdate(
      messageId,
      {
        $set: {
          text: "",
          messageType: "text",
          deletedAt,
          updatedAt: deletedAt,
        },
        $unset: {
          image: "",
          call: "",
        },
      },
      { new: true },
    );

    if (!updatedMessage) {
      respondNotFound(res, "Message");
      return;
    }

    if (syncLatestMessage) {
      await Chat.findByIdAndUpdate(
        chat._id,
        {
          latestMessage: {
            text: "Message deleted",
            sender: userId.toString(),
          },
          updatedAt: deletedAt,
        },
        { new: true },
      );
    }

    const clientMessage = toClientMessage(updatedMessage, chat.users);

    io.to(message.chatId.toString()).emit("messageDeleted", clientMessage);
    chat.users.forEach((participantId) => {
      io.to(participantId.toString()).emit("messageDeleted", clientMessage);
    });

    respondSuccess(res, "Message deleted", { message: clientMessage });
  },
);

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
