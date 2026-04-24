import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  type StoredChat = {
    _id: string;
    users: string[];
  };
  type StoredUser = {
    _id: string;
    name: string;
    email: string;
  };
  type StoredMessage = {
    _id: string;
    chatId: string;
    sender: string;
    text?: string;
    messageType: "call";
    seen: boolean;
    seenAt?: Date;
    call?: Record<string, unknown>;
    createdAt: Date;
  };
  type StoredCall = {
    _id: string;
    chatId: string;
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
    endReason?: "declined" | "missed" | "hangup" | "disconnect" | "cancelled";
    endedBy?: string;
    startedAt?: Date;
    endedAt?: Date;
    durationSeconds?: number;
    summaryWrittenAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    save: () => Promise<StoredCall>;
  };

  const chats = new Map<string, StoredChat>();
  const calls = new Map<string, StoredCall>();
  const users = new Map<string, StoredUser>();
  const messages = new Map<string, StoredMessage>();
  const onlineUsers = new Map<string, string[]>();
  const events: Array<{ target: string; event: string; payload: unknown }> = [];
  let nextCallId = 1;
  let nextMessageId = 1;

  const buildChat = ({
    _id,
    users: participantIds,
  }: {
    _id: string;
    users: string[];
  }) => {
    const chat = { _id, users: participantIds };
    chats.set(_id, chat);
    return chat;
  };

  const buildUser = (user: StoredUser) => {
    users.set(user._id, user);
    return user;
  };

  const createStoredCall = (data: {
    _id?: string;
    chatId: string;
    initiatorId: string;
    recipientId: string;
    participants: string[];
    mode?: "video";
    status?: StoredCall["status"];
  }) => {
    const callId = data._id ?? `${nextCallId++}`.padStart(24, "0");
    const storedCall: StoredCall = {
      _id: callId,
      chatId: data.chatId,
      initiatorId: data.initiatorId,
      recipientId: data.recipientId,
      participants: data.participants,
      mode: data.mode ?? "video",
      status: data.status ?? "ringing",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      save: vi.fn(async function save(this: StoredCall) {
        calls.set(this._id, this);
        return this;
      }),
    };

    calls.set(callId, storedCall);
    return storedCall;
  };

  const matchQuery = (call: StoredCall, query: Record<string, unknown>) => {
    return Object.entries(query).every(([key, expected]) => {
      if (key === "participants" && typeof expected === "string") {
        return call.participants.includes(expected);
      }

      if (
        key === "status" &&
        expected &&
        typeof expected === "object" &&
        "$in" in expected &&
        Array.isArray(expected.$in)
      ) {
        return expected.$in.includes(call.status);
      }

      if (
        key === "_id" &&
        expected &&
        typeof expected === "object" &&
        "$ne" in expected
      ) {
        return call._id !== expected.$ne;
      }

      return (call as unknown as Record<string, unknown>)[key] === expected;
    });
  };

  const Chat = {
    findById: vi.fn(async (chatId: string) => chats.get(chatId) ?? null),
    findByIdAndUpdate: vi.fn(async () => undefined),
  };

  const Call = {
    create: vi.fn(
      async (data: {
        chatId: string;
        initiatorId: string;
        recipientId: string;
        participants: string[];
        mode: "video";
        status: StoredCall["status"];
      }) => createStoredCall(data),
    ),
    findById: vi.fn(async (callId: string) => calls.get(callId) ?? null),
    findOne: vi.fn(async (query: Record<string, unknown>) => {
      return (
        Array.from(calls.values()).find((call) => matchQuery(call, query)) ??
        null
      );
    }),
    find: vi.fn(async (query: Record<string, unknown>) => {
      return Array.from(calls.values()).filter((call) =>
        matchQuery(call, query),
      );
    }),
  };

  const Messages = vi.fn(function Messages(
    this: StoredMessage,
    data: Omit<StoredMessage, "_id" | "createdAt"> & { createdAt?: Date },
  ) {
    const messageId = `${nextMessageId++}`.padStart(24, "0");
    const message: StoredMessage = {
      _id: messageId,
      chatId: data.chatId,
      sender: data.sender,
      text: data.text,
      messageType: "call",
      seen: data.seen,
      seenAt: data.seenAt,
      call: data.call,
      createdAt: data.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    };
    Object.assign(this, message);
    this.save = vi.fn(async () => {
      messages.set(messageId, message);
      return message;
    });
  }) as unknown as {
    new (
      data: Record<string, unknown>,
    ): StoredMessage & { save: () => Promise<StoredMessage> };
  };

  const UserSnapshot = {
    findById: vi.fn(async (userId: string) => users.get(userId) ?? null),
  };

  const io = {
    to: vi.fn((target: string) => ({
      emit: vi.fn((event: string, payload: unknown) => {
        events.push({ target, event, payload });
      }),
    })),
  };

  const getUserSocketIds = vi.fn(
    (userId: string) => onlineUsers.get(userId) ?? [],
  );

  const setOnline = (userId: string, socketIds: string[]) => {
    onlineUsers.set(userId, socketIds);
  };

  const reset = () => {
    chats.clear();
    calls.clear();
    users.clear();
    messages.clear();
    onlineUsers.clear();
    events.length = 0;
    nextCallId = 1;
    nextMessageId = 1;
    Chat.findById.mockClear();
    Chat.findByIdAndUpdate.mockClear();
    Call.create.mockClear();
    Call.findById.mockClear();
    Call.findOne.mockClear();
    Call.find.mockClear();
    UserSnapshot.findById.mockClear();
    getUserSocketIds.mockClear();
    io.to.mockClear();
  };

  return {
    buildChat,
    buildUser,
    createStoredCall,
    reset,
    setOnline,
    Chat,
    Call,
    Messages,
    UserSnapshot,
    getUserSocketIds,
    io,
    calls,
    messages,
    events,
  };
});

vi.mock("../src/model/Chat.js", () => ({
  Chat: testState.Chat,
}));

vi.mock("../src/model/Call.js", () => ({
  Call: testState.Call,
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
    CALL_RING_TIMEOUT_SECONDS: 30,
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

const { default: callRouter } = await import("../src/routes/call.js");

const app = express();
app.use(express.json());
app.use("/api/v1", callRouter);

const signToken = (user: { _id: string; name: string; email: string }) => {
  return jwt.sign({ user }, testAuth.privateKey, {
    algorithm: "RS256",
    expiresIn: "15d",
    issuer: testAuth.issuer,
    audience: testAuth.audience,
    subject: user._id,
  });
};

describe("call service routes", () => {
  const caller = {
    _id: "507f1f77bcf86cd799439011",
    name: "Alice",
    email: "alice@example.com",
  };
  const callee = {
    _id: "507f1f77bcf86cd799439012",
    name: "Bob",
    email: "bob@example.com",
  };
  const outsider = {
    _id: "507f1f77bcf86cd799439013",
    name: "Mallory",
    email: "mallory@example.com",
  };
  const chatId = "507f1f77bcf86cd799439021";

  beforeEach(() => {
    vi.useFakeTimers();
    testState.reset();
    testState.buildChat({ _id: chatId, users: [caller._id, callee._id] });
    testState.buildUser(caller);
    testState.buildUser(callee);
    testState.buildUser(outsider);
    testState.setOnline(callee._id, ["socket-1"]);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("initiates a video call when the recipient is online", async () => {
    const response = await request(app)
      .post("/api/v1/call/initiate")
      .set("Authorization", `Bearer ${signToken(caller)}`)
      .send({ chatId });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.call).toMatchObject({
      chatId,
      initiatorId: caller._id,
      recipientId: callee._id,
      status: "ringing",
      mode: "video",
    });
    expect(testState.Call.create).toHaveBeenCalledWith({
      chatId,
      initiatorId: caller._id,
      recipientId: callee._id,
      participants: [caller._id, callee._id],
      mode: "video",
      status: "ringing",
    });
    expect(testState.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: caller._id,
          event: "call:outgoing",
        }),
        expect.objectContaining({
          target: callee._id,
          event: "call:incoming",
        }),
      ]),
    );
  });

  it("rejects initiate when the recipient is offline", async () => {
    testState.setOnline(callee._id, []);

    const response = await request(app)
      .post("/api/v1/call/initiate")
      .set("Authorization", `Bearer ${signToken(caller)}`)
      .send({ chatId });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      message: "Recipient is offline",
    });
  });

  it("accepts a ringing video call and emits the accepted event", async () => {
    const call = testState.createStoredCall({
      chatId,
      initiatorId: caller._id,
      recipientId: callee._id,
      participants: [caller._id, callee._id],
      status: "ringing",
    });

    const response = await request(app)
      .post(`/api/v1/call/${call._id}/accept`)
      .set("Authorization", `Bearer ${signToken(callee)}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.call).toMatchObject({
      _id: call._id,
      status: "accepted",
    });
    expect(testState.calls.get(call._id)?.status).toBe("accepted");
    expect(testState.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: caller._id,
          event: "call:accepted",
        }),
        expect.objectContaining({
          target: callee._id,
          event: "call:accepted",
        }),
      ]),
    );
  });

  it("declines a ringing call and writes a call summary message", async () => {
    const call = testState.createStoredCall({
      chatId,
      initiatorId: caller._id,
      recipientId: callee._id,
      participants: [caller._id, callee._id],
      status: "ringing",
    });

    const response = await request(app)
      .post(`/api/v1/call/${call._id}/decline`)
      .set("Authorization", `Bearer ${signToken(callee)}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.call).toMatchObject({
      _id: call._id,
      status: "declined",
      endReason: "declined",
    });
    expect(Array.from(testState.messages.values())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chatId,
          messageType: "call",
          text: "Video call declined",
          seen: true,
        }),
      ]),
    );
    expect(testState.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: caller._id, event: "call:declined" }),
        expect.objectContaining({ target: callee._id, event: "call:declined" }),
        expect.objectContaining({ target: chatId, event: "newMessage" }),
      ]),
    );
  });

  it("ends an accepted call and stores an ended summary message", async () => {
    const call = testState.createStoredCall({
      chatId,
      initiatorId: caller._id,
      recipientId: callee._id,
      participants: [caller._id, callee._id],
      status: "accepted",
    });
    call.startedAt = new Date("2026-01-01T00:00:00.000Z");

    const response = await request(app)
      .post(`/api/v1/call/${call._id}/end`)
      .set("Authorization", `Bearer ${signToken(caller)}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.call).toMatchObject({
      _id: call._id,
      status: "ended",
      endReason: "hangup",
    });
    expect(Array.from(testState.messages.values())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chatId,
          messageType: "call",
          text: expect.stringContaining("Video call ended"),
        }),
      ]),
    );
    expect(testState.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: caller._id, event: "call:ended" }),
        expect.objectContaining({ target: callee._id, event: "call:ended" }),
      ]),
    );
  });

  it("marks a ringing call as missed when the ring timeout expires", async () => {
    const response = await request(app)
      .post("/api/v1/call/initiate")
      .set("Authorization", `Bearer ${signToken(caller)}`)
      .send({ chatId });

    expect(response.status).toBe(201);
    const callId = response.body.call._id as string;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(testState.calls.get(callId)?.status).toBe("missed");
    expect(Array.from(testState.messages.values())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chatId,
          text: "Missed video call",
          messageType: "call",
        }),
      ]),
    );
    expect(testState.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: caller._id, event: "call:ended" }),
        expect.objectContaining({ target: callee._id, event: "call:ended" }),
      ]),
    );
  });
});
