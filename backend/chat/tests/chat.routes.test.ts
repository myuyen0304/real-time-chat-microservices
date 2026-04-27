import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testAuth = vi.hoisted(() => ({
  privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDIpApQB4sYy4ZJ
vMinirhgObaCV3matDTyd+s/blT/gH8c+eW6+qgO+GUle+u07UtOxm/6WOjGY7TS
1LqXhJeheBeKI+RC0T57+sMb+Yjr9IlnaNzdqDZKiOCF1EaQLBeE5u1WGk7QHSmC
un38ynwFrYnZ731QmfrPLL6MIWDu9Ms6wVEnYUZynmvh3zG0DwuqWxWZwaCMucUd
XhAdyAzr8fq8g3Is17q2QeHJAAMKhAp7ggVlPnZNJCBFPXeY3xWNNoWIFygXo4Nx
rqMQTEblUp+5pKCz8FnVfwm2IbsiG8Rwjxjc+zdSBJVUJStXs6lu1WdQrM+EOBxt
qNU5KGclAgMBAAECggEAVuZ9tPXfcAjOi+dhPPefLcYxXzjF6ZR9jjsUP+/ojpU3
+PPfZWGlIn7BSD/o8f8I7ACUhWi2wR50NhB/FJsQFZZvE5zCA5KfLpGIqfglLpVG
YeyQJMzzXsrz++LaAR2nvh9K0k0or4jB7uYZJUEKAGeOWj8ZFqzqbYriqMzYMAY+
rfDQEAagsVVgBkfiKaw4/rDhSj0En4GOxP36H2UMmjYn77H8PiecYcaswtZs2GG0
TkUfypffGbNPg6vEjeepP9jJY8CowT19mmR1oFIeiOa1e+8CgVAE55mueLj7pA/U
mo30Dr/51FfAwxnQu/lQoVsl2HRyXRqml3Y/wSj2LQKBgQD/6QQUjVUHy8HxCy3i
GX7gub2d/N1Suy2WhjDtT+4qDCUQKhKdxdoD9Cj3H5VBplAmhCJLJ0dhr0KK/OtH
ANsj0tjzCKA+EZR4dEgWUWmfhBf0X6HAAGGBEusBr7H1frZyoV0KfSDibD2weOUd
5w0/mHiak4WRPylgEVe3ZOqkRwKBgQDItg94dheslThC7MWG9yf8KPBeYIagX1J+
tYJMxkPEfMREEUFmbynY6Ll7vk2QdPa6PH/hD8z7uoMnY1R4NNebMAQct0XPm74L
yyfw1rvGXk4MIIeYW7pMLX3MmvbDSv9vyNdbaoWYJfMmBNlUTZNHbKVDrtsUqSz4
PqfCNkBrMwKBgDKaQetKcxjiiov+WOlPf04yjDMUUDNOvdn42O3kE0UPN7j1iM7X
059ahUswXJQprcmf8SQJNU00maTgFCnrGmoABFQyTXVYhpI29BYtrQQU26O/0T0l
FiKuufeQZVEU6EDMdZhgW8NKAfzGOw/poy4DGT3/k7a/1Y+gfkbOVrN7AoGBAMdn
SRtuh7qoTUsAHIYoCouUyKma0GWIDldgUOGhoDYXlo3hbs4r5rFfFNgBiuHXsj/4
VzvsDMSS2jZJkuQR65p8K7mzwyGtIzRoU3gMfmVnz7ZwowYVK5L/JxodYsdHPVt7
d6mUvMEaAuVkr933bDjrkY0arQFrygefh9+FMp7NAoGABZZIop/Uwc/LkPQo1VBi
AaJ2i77cu+/fhxnyQtxdoF7WNJ2UBa/vK7OsnKkurox0WyRzzUxBgvigIqIMHjl5
npyvXZkGjoHuuwRPu/Dw4Nz+ZwMPI1u+YdqJb6NYw88bccwOfc0nGI1r533MdptK
6XNhuFUl0e+nnygIsGilFRs=
-----END PRIVATE KEY-----`,
  publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyKQKUAeLGMuGSbzIp4q4
YDm2gld5mrQ08nfrP25U/4B/HPnluvqoDvhlJXvrtO1LTsZv+ljoxmO00tS6l4SX
oXgXiiPkQtE+e/rDG/mI6/SJZ2jc3ag2SojghdRGkCwXhObtVhpO0B0pgrp9/Mp8
Ba2J2e99UJn6zyy+jCFg7vTLOsFRJ2FGcp5r4d8xtA8LqlsVmcGgjLnFHV4QHcgM
6/H6vINyLNe6tkHhyQADCoQKe4IFZT52TSQgRT13mN8VjTaFiBcoF6ODca6jEExG
5VKfuaSgs/BZ1X8JtiG7IhvEcI8Y3Ps3UgSVVCUrV7OpbtVnUKzPhDgcbajVOShn
JQIDAQAB
-----END PUBLIC KEY-----`,
  issuer: "chat-app-auth",
  audience: "chat-app-clients",
}));

const testState = vi.hoisted(() => {
  type SnapshotUser = { _id: string; name: string; email: string };
  type StoredChat = {
    _id: string;
    chatType: "direct" | "group";
    users: string[];
    groupName?: string;
    groupAvatar?: string;
    latestMessage?: { text: string; sender: string } | null;
    updatedAt: Date;
    toObject: () => Record<string, unknown>;
  };
  type StoredMessage = {
    _id: string;
    chatId: string;
    sender: string;
    text?: string;
    messageType: "text" | "image";
    readBy: Array<{ userId: string; readAt: Date }>;
    seen: boolean;
    seenAt?: Date;
    image?: { url: string; publicId: string };
    createdAt: Date;
  };

  const chats = new Map<string, StoredChat>();
  const messages = new Map<string, StoredMessage>();
  const snapshots = new Map<string, SnapshotUser>();
  const roomMembers = new Map<string, Set<string>>();
  const socketRoomMembership = new Map<string, Set<string>>();
  const events: Array<{ target: string; event: string; payload: unknown }> = [];
  let nextChatId = 1;
  let nextMessageId = 1;

  const isObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const matchesCondition = (
    record: Record<string, unknown>,
    query: Record<string, unknown>,
  ) => {
    return Object.entries(query).every(([key, expected]) => {
      const actual = record[key];

      if (isObject(expected) && "$ne" in expected) {
        return actual !== expected.$ne;
      }

      if (
        key === "readBy" &&
        isObject(expected) &&
        isObject(expected.$not) &&
        isObject(expected.$not.$elemMatch)
      ) {
        const receipts = Array.isArray(actual) ? actual : [];
        return !receipts.some((receipt) =>
          matchesCondition(
            receipt as Record<string, unknown>,
            expected.$not.$elemMatch as Record<string, unknown>,
          ),
        );
      }

      return actual === expected;
    });
  };

  const buildChat = ({
    _id,
    chatType = "direct",
    users,
    groupName,
    groupAvatar,
    latestMessage = null,
    updatedAt = new Date("2026-01-01T00:00:00.000Z"),
  }: {
    _id?: string;
    chatType?: "direct" | "group";
    users: string[];
    groupName?: string;
    groupAvatar?: string;
    latestMessage?: { text: string; sender: string } | null;
    updatedAt?: Date;
  }) => {
    const chatId = _id ?? `${nextChatId++}`.padStart(24, "0");
    const chat: StoredChat = {
      _id: chatId,
      chatType,
      users,
      groupName,
      groupAvatar,
      latestMessage,
      updatedAt,
      toObject: () => ({
        _id: chatId,
        chatType,
        users: [...users],
        groupName,
        groupAvatar,
        latestMessage,
        updatedAt,
      }),
    };

    chats.set(chatId, chat);
    return chat;
  };

  const buildMessage = ({
    _id,
    chatId,
    sender,
    text,
    readBy = [],
    seen = false,
    seenAt,
    image,
    messageType = "text",
    createdAt = new Date("2026-01-01T00:00:00.000Z"),
  }: {
    _id?: string;
    chatId: string;
    sender: string;
    text?: string;
    readBy?: Array<{ userId: string; readAt: Date }>;
    seen?: boolean;
    seenAt?: Date;
    image?: { url: string; publicId: string };
    messageType?: "text" | "image";
    createdAt?: Date;
  }) => {
    const messageId = _id ?? `${nextMessageId++}`.padStart(24, "0");
    const message: StoredMessage = {
      _id: messageId,
      chatId,
      sender,
      text,
      readBy,
      seen,
      seenAt,
      image,
      messageType,
      createdAt,
    };
    messages.set(messageId, message);
    return message;
  };

  const buildSnapshot = (user: SnapshotUser) => {
    snapshots.set(user._id, user);
    return user;
  };

  const Chat = {
    findOne: vi.fn(
      async (query: {
        chatType?: "direct" | "group";
        $or?: Array<{ chatType: "direct" } | { chatType: { $exists: false } }>;
        users: { $all: string[]; $size: number };
      }) => {
        return (
          Array.from(chats.values()).find((chat) => {
            const matchesChatType = query.$or
              ? query.$or.some((condition) => {
                  if ("chatType" in condition && condition.chatType === "direct") {
                    return chat.chatType === "direct";
                  }

                  return false;
                })
              : query.chatType
                ? chat.chatType === query.chatType
                : true;

            return (
              matchesChatType &&
              chat.users.length === query.users.$size &&
              query.users.$all.every((userId) => chat.users.includes(userId))
            );
          }) ?? null
        );
      },
    ),
    create: vi.fn(
      async ({
        chatType = "direct",
        users,
        groupName,
        groupAvatar,
      }: {
        chatType?: "direct" | "group";
        users: string[];
        groupName?: string;
        groupAvatar?: string;
      }) => {
        return buildChat({ chatType, users, groupName, groupAvatar });
      },
    ),
    findById: vi.fn(async (id: string) => chats.get(String(id)) ?? null),
    findByIdAndUpdate: vi.fn(
      async (
        id: string,
        update: {
          latestMessage?: { text: string; sender: string };
          updatedAt?: Date;
        },
      ) => {
        const chat = chats.get(String(id));
        if (!chat) return null;
        if (update.latestMessage) {
          chat.latestMessage = update.latestMessage;
        }
        if (update.updatedAt) {
          chat.updatedAt = update.updatedAt;
        }
        chats.set(chat._id, chat);
        return chat;
      },
    ),
    find: vi.fn((query: { users: string }) => {
      const results = Array.from(chats.values()).filter((chat) =>
        chat.users.includes(query.users),
      );
      return {
        sort: vi.fn(async ({ updatedAt }: { updatedAt: 1 | -1 }) => {
          return [...results].sort((left, right) => {
            const delta = left.updatedAt.getTime() - right.updatedAt.getTime();
            return updatedAt === -1 ? -delta : delta;
          });
        }),
      };
    }),
  };

  const Messages = vi.fn(function Messages(
    this: StoredMessage,
    data: Omit<StoredMessage, "_id" | "createdAt"> & { createdAt?: Date },
  ) {
    const stored = buildMessage({
      ...data,
      createdAt: data.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    });
    Object.assign(this, stored);
    this.save = vi.fn(async () => stored);
  }) as unknown as {
    new (
      data: Record<string, unknown>,
    ): StoredMessage & { save: () => Promise<StoredMessage> };
    find: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    countDocuments: ReturnType<typeof vi.fn>;
  };

  Messages.find = vi.fn((query: Record<string, unknown>) => {
    const filtered = Array.from(messages.values()).filter((message) =>
      matchesCondition(message as unknown as Record<string, unknown>, query),
    );

    return {
      sort: vi.fn(async ({ createdAt }: { createdAt: 1 | -1 }) => {
        return [...filtered].sort((left, right) => {
          const delta = left.createdAt.getTime() - right.createdAt.getTime();
          return createdAt === 1 ? delta : -delta;
        });
      }),
      then: undefined,
      catch: undefined,
      finally: undefined,
      [Symbol.asyncIterator]: undefined,
      length: filtered.length,
      map: filtered.map.bind(filtered),
    } as unknown as Promise<StoredMessage[]> & {
      sort: ({ createdAt }: { createdAt: 1 | -1 }) => Promise<StoredMessage[]>;
      length: number;
      map: typeof filtered.map;
    };
  });

  Messages.updateMany = vi.fn(
    async (query: Record<string, unknown>, update: Record<string, unknown>) => {
      let modifiedCount = 0;
      Array.from(messages.values()).forEach((message) => {
        if (
          matchesCondition(message as unknown as Record<string, unknown>, query)
        ) {
          if ("$addToSet" in update && isObject(update.$addToSet)) {
            const readBy = update.$addToSet.readBy;
            if (isObject(readBy)) {
              const alreadyRead = message.readBy.some(
                (receipt) => receipt.userId === readBy.userId,
              );
              if (!alreadyRead) {
                message.readBy.push(
                  readBy as { userId: string; readAt: Date },
                );
              }
            }
          }

          if ("$set" in update && isObject(update.$set)) {
            Object.assign(message, update.$set);
          }

          if (!("$addToSet" in update) && !("$set" in update)) {
            Object.assign(message, update);
          }
          messages.set(message._id, message);
          modifiedCount += 1;
        }
      });
      return { modifiedCount };
    },
  );

  Messages.countDocuments = vi.fn(async (query: Record<string, unknown>) => {
    return Array.from(messages.values()).filter((message) =>
      matchesCondition(message as unknown as Record<string, unknown>, query),
    ).length;
  });

  const UserSnapshot = {
    findById: vi.fn(async (id: string) => snapshots.get(String(id)) ?? null),
    find: vi.fn(async (query: { _id: { $in: string[] } }) => {
      return query._id.$in
        .map((id) => snapshots.get(String(id)))
        .filter((user): user is SnapshotUser => Boolean(user));
    }),
    findByIdAndUpdate: vi.fn(
      async (id: string, payload: { name: string; email: string }) => {
        const nextValue = { _id: id, ...payload };
        snapshots.set(id, nextValue);
        return nextValue;
      },
    ),
  };

  const io = {
    to: vi.fn((target: string) => ({
      emit: vi.fn((event: string, payload: unknown) => {
        events.push({ target, event, payload });
      }),
    })),
    sockets: {
      sockets: new Map<string, { rooms: Set<string> }>(),
    },
  };

  const getUserSocketIds = vi.fn((userId: string) =>
    Array.from(roomMembers.get(userId) ?? []),
  );

  const registerSocketPresence = ({
    userId,
    socketId,
    rooms = [],
  }: {
    userId: string;
    socketId: string;
    rooms?: string[];
  }) => {
    const sockets = roomMembers.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    roomMembers.set(userId, sockets);
    socketRoomMembership.set(socketId, new Set(rooms));
    io.sockets.sockets.set(socketId, { rooms: new Set(rooms) });
  };

  const reset = () => {
    chats.clear();
    messages.clear();
    snapshots.clear();
    roomMembers.clear();
    socketRoomMembership.clear();
    io.sockets.sockets.clear();
    events.length = 0;
    nextChatId = 1;
    nextMessageId = 1;
    Chat.findOne.mockClear();
    Chat.create.mockClear();
    Chat.findById.mockClear();
    Chat.findByIdAndUpdate.mockClear();
    Chat.find.mockClear();
    Messages.find.mockClear();
    Messages.updateMany.mockClear();
    Messages.countDocuments.mockClear();
    UserSnapshot.findById.mockClear();
    UserSnapshot.find.mockClear();
    UserSnapshot.findByIdAndUpdate.mockClear();
    io.to.mockClear();
    getUserSocketIds.mockClear();
  };

  return {
    buildChat,
    buildMessage,
    buildSnapshot,
    chats,
    events,
    getUserSocketIds,
    io,
    Messages,
    registerSocketPresence,
    reset,
    Chat,
    UserSnapshot,
  };
});

vi.mock("../src/model/Chat.js", () => ({
  Chat: testState.Chat,
}));

vi.mock("../src/model/Message.js", () => ({
  Messages: testState.Messages,
}));

vi.mock("../src/model/UserSnapshot.js", () => ({
  UserSnapshot: testState.UserSnapshot,
}));

vi.mock("../src/config/socket.js", () => ({
  io: testState.io,
  getUserSocketIds: testState.getUserSocketIds,
}));

vi.mock("../src/config/env.js", () => ({
  chatEnv: {
    PORT: "5002",
    MONGO_URI: "mongodb://localhost:27017/chat_app",
    MONGO_DB_NAME: "chat_chat_service",
    REDIS_URL: "redis://localhost:6379",
    JWT_PUBLIC_KEY: testAuth.publicKey,
    JWT_ISSUER: testAuth.issuer,
    JWT_AUDIENCE: testAuth.audience,
    Rabbitmq_Host: "localhost",
    Rabbitmq_Username: "guest",
    Rabbitmq_Password: "guest",
    CLOUD_NAME: "cloud",
    API_KEY: "key",
    API_SECRET: "secret",
  },
}));

vi.mock("../src/middleware/multer.js", async () => {
  const actual = await vi.importActual<object>("../src/middleware/multer.js");
  return {
    ...actual,
    parseMessageUpload: (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => next(),
  };
});

const { default: chatRouter } = await import("../src/routes/chat.js");

const app = express();
app.use(express.json());
app.use("/api/v1", chatRouter);

const signToken = (user: { _id: string; name: string; email: string }) => {
  return jwt.sign({ user }, testAuth.privateKey, {
    algorithm: "RS256",
    expiresIn: "15d",
    issuer: testAuth.issuer,
    audience: testAuth.audience,
    subject: user._id,
  });
};

describe("chat service routes", () => {
  const loggedInUser = {
    _id: "507f1f77bcf86cd799439011",
    name: "Alice",
    email: "alice@example.com",
  };
  const otherUser = {
    _id: "507f1f77bcf86cd799439012",
    name: "Bob",
    email: "bob@example.com",
  };
  const outsider = {
    _id: "507f1f77bcf86cd799439013",
    name: "Mallory",
    email: "mallory@example.com",
  };

  beforeEach(() => {
    testState.reset();
    testState.buildSnapshot(loggedInUser);
    testState.buildSnapshot(otherUser);
    testState.buildSnapshot(outsider);
  });

  it("creates a new chat when the other user exists in UserSnapshot", async () => {
    const response = await request(app)
      .post("/api/v1/chat/new")
      .set("Authorization", `Bearer ${signToken(loggedInUser)}`)
      .send({ otherUserId: otherUser._id });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      message: "New chat created",
      chatId: "000000000000000000000001",
    });
    expect(testState.Chat.create).toHaveBeenCalledWith({
      chatType: "direct",
      users: [loggedInUser._id, otherUser._id],
    });
  });

  it("returns conflict when the chat already exists", async () => {
    const existingChat = testState.buildChat({
      _id: "507f1f77bcf86cd799439021",
      users: [loggedInUser._id, otherUser._id],
    });

    const response = await request(app)
      .post("/api/v1/chat/new")
      .set("Authorization", `Bearer ${signToken(loggedInUser)}`)
      .send({ otherUserId: otherUser._id });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      message: "Chat already existed",
      chatId: existingChat._id,
    });
    expect(testState.Chat.findOne).toHaveBeenCalledWith({
      $or: [{ chatType: "direct" }, { chatType: { $exists: false } }],
      users: { $all: [loggedInUser._id, otherUser._id], $size: 2 },
    });
  });

  it("creates a group chat with metadata and unique participants", async () => {
    const response = await request(app)
      .post("/api/v1/chat/new")
      .set("Authorization", `Bearer ${signToken(loggedInUser)}`)
      .send({
        chatType: "group",
        groupName: "Project Squad",
        groupAvatar: "https://example.com/group.png",
        userIds: [otherUser._id, outsider._id, loggedInUser._id],
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      message: "New chat created",
      chatId: "000000000000000000000001",
    });
    expect(testState.Chat.findOne).not.toHaveBeenCalled();
    expect(testState.Chat.create).toHaveBeenCalledWith({
      chatType: "group",
      users: [loggedInUser._id, otherUser._id, outsider._id],
      groupName: "Project Squad",
      groupAvatar: "https://example.com/group.png",
    });
  });

  it("sends a text message and broadcasts the new message", async () => {
    const chat = testState.buildChat({
      _id: "507f1f77bcf86cd799439031",
      users: [loggedInUser._id, otherUser._id],
    });

    const response = await request(app)
      .post("/api/v1/message")
      .set("Authorization", `Bearer ${signToken(loggedInUser)}`)
      .send({ chatId: chat._id, text: "Hello Bob" });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBeDefined();
    expect(response.body.message).toMatchObject({
      chatId: chat._id,
      sender: loggedInUser._id,
      text: "Hello Bob",
      messageType: "text",
      seen: false,
    });
    expect(testState.Chat.findByIdAndUpdate).toHaveBeenCalledWith(
      chat._id,
      {
        latestMessage: { text: "Hello Bob", sender: loggedInUser._id },
        updatedAt: expect.any(Date),
      },
      { new: true },
    );
    expect(testState.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: chat._id, event: "newMessage" }),
        expect.objectContaining({ target: otherUser._id, event: "newMessage" }),
        expect.objectContaining({
          target: loggedInUser._id,
          event: "newMessage",
        }),
      ]),
    );
  });

  it("returns chats with explicit participants for direct and group chats", async () => {
    testState.buildChat({
      _id: "507f1f77bcf86cd799439032",
      users: [loggedInUser._id, otherUser._id],
      latestMessage: { text: "Latest direct", sender: otherUser._id },
      updatedAt: new Date("2026-01-01T00:03:00.000Z"),
    });
    testState.buildChat({
      _id: "507f1f77bcf86cd799439033",
      chatType: "group",
      users: [loggedInUser._id, otherUser._id, outsider._id],
      groupName: "Project Squad",
      groupAvatar: "https://example.com/group.png",
      latestMessage: { text: "Latest group", sender: outsider._id },
      updatedAt: new Date("2026-01-01T00:04:00.000Z"),
    });

    const response = await request(app)
      .get("/api/v1/chat/all")
      .set("Authorization", `Bearer ${signToken(loggedInUser)}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.chats).toHaveLength(2);
    expect(response.body.chats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chat: expect.objectContaining({
            _id: "507f1f77bcf86cd799439032",
            chatType: "direct",
            latestMessage: { text: "Latest direct", sender: otherUser._id },
          }),
          participants: expect.arrayContaining([loggedInUser, otherUser]),
        }),
        expect.objectContaining({
          chat: expect.objectContaining({
            _id: "507f1f77bcf86cd799439033",
            chatType: "group",
            groupName: "Project Squad",
            groupAvatar: "https://example.com/group.png",
            latestMessage: { text: "Latest group", sender: outsider._id },
          }),
          participants: expect.arrayContaining([
            loggedInUser,
            otherUser,
            outsider,
          ]),
        }),
      ]),
    );
  });

  it("fetches messages for a participant and marks unseen messages as seen", async () => {
    const chat = testState.buildChat({
      _id: "507f1f77bcf86cd799439041",
      users: [loggedInUser._id, otherUser._id],
    });
    testState.buildMessage({
      _id: "507f1f77bcf86cd799439051",
      chatId: chat._id,
      sender: otherUser._id,
      text: "Hi Alice",
      seen: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    testState.buildMessage({
      _id: "507f1f77bcf86cd799439052",
      chatId: chat._id,
      sender: loggedInUser._id,
      text: "Hello Bob",
      seen: true,
      seenAt: new Date("2026-01-01T00:01:00.000Z"),
      createdAt: new Date("2026-01-01T00:01:00.000Z"),
    });

    const response = await request(app)
      .get(`/api/v1/message/${chat._id}`)
      .set("Authorization", `Bearer ${signToken(loggedInUser)}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.messages).toHaveLength(2);
    expect(response.body.chat).toMatchObject({
      _id: chat._id,
      chatType: "direct",
      users: [loggedInUser._id, otherUser._id],
    });
    expect(response.body.participants).toEqual(
      expect.arrayContaining([loggedInUser, otherUser]),
    );
    expect(testState.Messages.updateMany).toHaveBeenCalledWith(
      {
        chatId: chat._id,
        sender: { $ne: loggedInUser._id },
        readBy: {
          $not: {
            $elemMatch: {
              userId: loggedInUser._id,
            },
          },
        },
      },
      {
        $addToSet: {
          readBy: { userId: loggedInUser._id, readAt: expect.any(Date) },
        },
        $set: { seenAt: expect.any(Date) },
      },
    );
    expect(testState.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: otherUser._id,
          event: "messagesSeen",
          payload: expect.objectContaining({
            chatId: chat._id,
            seenBy: loggedInUser._id,
            messageIds: ["507f1f77bcf86cd799439051"],
          }),
        }),
      ]),
    );
  });

  it("forbids a non participant from reading chat messages", async () => {
    const chat = testState.buildChat({
      _id: "507f1f77bcf86cd799439061",
      users: [loggedInUser._id, otherUser._id],
    });

    const response = await request(app)
      .get(`/api/v1/message/${chat._id}`)
      .set("Authorization", `Bearer ${signToken(outsider)}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      message: "You are not a participant",
    });
  });

  it("marks new messages as seen immediately when the receiver is in the room", async () => {
    const chat = testState.buildChat({
      _id: "507f1f77bcf86cd799439071",
      users: [loggedInUser._id, otherUser._id],
    });
    testState.registerSocketPresence({
      userId: otherUser._id,
      socketId: "socket-1",
      rooms: [chat._id],
    });

    const response = await request(app)
      .post("/api/v1/message")
      .set("Authorization", `Bearer ${signToken(loggedInUser)}`)
      .send({ chatId: chat._id, text: "Seen instantly" });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatchObject({
      seen: true,
      seenAt: expect.any(String),
    });
    expect(testState.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: loggedInUser._id,
          event: "messagesSeen",
          payload: expect.objectContaining({
            chatId: chat._id,
            seenBy: otherUser._id,
          }),
        }),
      ]),
    );
  });
});
