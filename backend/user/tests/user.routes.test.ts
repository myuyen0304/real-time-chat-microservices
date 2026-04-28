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
  type StoredUser = {
    _id: string;
    name: string;
    email: string;
    save: ReturnType<typeof vi.fn>;
  };

  const redisStore = new Map<string, string>();
  const usersById = new Map<string, StoredUser>();
  const usersByEmail = new Map<string, StoredUser>();
  let nextId = 1;

  const buildUser = ({
    _id,
    name,
    email,
  }: {
    _id?: string;
    name: string;
    email: string;
  }): StoredUser => {
    const user = {
      _id: _id ?? String(nextId++),
      name,
      email,
      save: vi.fn(async function save(this: StoredUser) {
        usersById.set(this._id, this);
        usersByEmail.set(this.email, this);
        return this;
      }),
    } satisfies StoredUser;

    usersById.set(user._id, user);
    usersByEmail.set(user.email, user);
    return user;
  };

  const redisClient = {
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => {
      const existed = redisStore.delete(key);
      return existed ? 1 : 0;
    }),
  };

  const publishToQueue = vi.fn(async () => undefined);

  const User = {
    findOne: vi.fn(async ({ email }: { email: string }) => {
      return usersByEmail.get(email) ?? null;
    }),
    create: vi.fn(async ({ name, email }: { name: string; email: string }) => {
      return buildUser({ name, email });
    }),
    findById: vi.fn(async (id: string) => {
      return usersById.get(String(id)) ?? null;
    }),
    find: vi.fn(async () => Array.from(usersById.values())),
  };

  const reset = () => {
    redisStore.clear();
    usersById.clear();
    usersByEmail.clear();
    nextId = 1;
    redisClient.get.mockClear();
    redisClient.set.mockClear();
    redisClient.del.mockClear();
    publishToQueue.mockClear();
    User.findOne.mockClear();
    User.create.mockClear();
    User.findById.mockClear();
    User.find.mockClear();
  };

  return {
    buildUser,
    publishToQueue,
    redisClient,
    redisStore,
    reset,
    User,
  };
});

vi.mock("../src/config/redis.js", () => ({
  redisClient: testState.redisClient,
}));

vi.mock("../src/config/rabbitmq.js", () => ({
  publishToQueue: testState.publishToQueue,
}));

vi.mock("../src/model/User.js", () => ({
  User: testState.User,
}));

vi.mock("../src/config/env.js", () => ({
  userEnv: {
    PORT: "5000",
    MONGO_URI: "mongodb://localhost:27017/chat_app",
    MONGO_DB_NAME: "chat_user_service",
    REDIS_URL: "redis://localhost:6379",
    JWT_PRIVATE_KEY: testAuth.privateKey,
    JWT_PUBLIC_KEY: testAuth.publicKey,
    JWT_ISSUER: testAuth.issuer,
    JWT_AUDIENCE: testAuth.audience,
    Rabbitmq_Host: "localhost",
    Rabbitmq_Username: "guest",
    Rabbitmq_Password: "guest",
  },
}));

const { default: userRouter } = await import("../src/routes/user.js");

const app = express();
app.use(express.json());
app.use("/api/v1", userRouter);

const signToken = (user: { _id: string; name: string; email: string }) => {
  return jwt.sign({ user }, testAuth.privateKey, {
    algorithm: "RS256",
    expiresIn: "15d",
    issuer: testAuth.issuer,
    audience: testAuth.audience,
    subject: user._id,
  });
};

describe("user service auth routes", () => {
  beforeEach(() => {
    testState.reset();
    vi.restoreAllMocks();
  });

  it("sends OTP and publishes the send-otp event on login", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123456);

    const response = await request(app)
      .post("/api/v1/login")
      .send({ email: "  Test@Example.com " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "OTP sent to your mail",
    });
    expect(testState.redisStore.get("otp:test@example.com")).toBe("211110");
    expect(testState.redisStore.get("otp:ratelimit:test@example.com")).toBe(
      "true",
    );
    expect(testState.publishToQueue).toHaveBeenCalledTimes(1);
    expect(testState.publishToQueue).toHaveBeenCalledWith("send-otp", {
      to: "test@example.com",
      subject: "Your otp code",
      body: "Your OTP is 211110. It is valid for 5 minutes,",
    });
  });

  it("rejects login when the OTP rate limit is active", async () => {
    testState.redisStore.set("otp:ratelimit:spam@example.com", "true");

    const response = await request(app)
      .post("/api/v1/login")
      .send({ email: "spam@example.com" });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      success: false,
      message: "Too many requests. Please wait before requesting new otp",
    });
    expect(testState.publishToQueue).not.toHaveBeenCalled();
  });

  it("verifies OTP, creates a user, and publishes the user event", async () => {
    testState.redisStore.set("otp:alice@example.com", "123456");
    testState.redisStore.set("otp:verify:attempts:alice@example.com", "2");

    const response = await request(app)
      .post("/api/v1/verify")
      .send({ email: "alice@example.com", otp: "123456" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("User verified");
    expect(response.body.user).toMatchObject({
      _id: "1",
      email: "alice@example.com",
      name: "alice@ex",
    });
    expect(response.body.token).toEqual(expect.any(String));
    expect(testState.publishToQueue).toHaveBeenCalledWith("user.events", {
      type: "user.upserted",
      payload: {
        _id: "1",
        email: "alice@example.com",
        name: "alice@ex",
      },
    });
    expect(testState.redisStore.has("otp:alice@example.com")).toBe(false);
    expect(
      testState.redisStore.has("otp:verify:attempts:alice@example.com"),
    ).toBe(false);

    const decoded = jwt.verify(response.body.token, testAuth.publicKey, {
      algorithms: ["RS256"],
      issuer: testAuth.issuer,
      audience: testAuth.audience,
    }) as jwt.JwtPayload;

    expect(decoded.user).toMatchObject({
      _id: "1",
      email: "alice@example.com",
      name: "alice@ex",
    });
  });

  it("rejects verify requests when the OTP is wrong", async () => {
    testState.redisStore.set("otp:bob@example.com", "654321");

    const response = await request(app)
      .post("/api/v1/verify")
      .send({ email: "bob@example.com", otp: "123456" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "Invalid or expired OTP",
    });
    expect(testState.redisStore.get("otp:verify:attempts:bob@example.com")).toBe(
      "1",
    );
    expect(testState.publishToQueue).not.toHaveBeenCalled();
  });

  it("rejects verify requests when the OTP has expired", async () => {
    const response = await request(app)
      .post("/api/v1/verify")
      .send({ email: "expired@example.com", otp: "123456" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: "Invalid or expired OTP",
    });
    expect(
      testState.redisStore.get("otp:verify:attempts:expired@example.com"),
    ).toBe("1");
    expect(testState.publishToQueue).not.toHaveBeenCalled();
  });

  it("rate limits verify requests after too many failed attempts", async () => {
    testState.redisStore.set("otp:blocked@example.com", "123456");
    testState.redisStore.set("otp:verify:attempts:blocked@example.com", "5");

    const response = await request(app)
      .post("/api/v1/verify")
      .send({ email: "blocked@example.com", otp: "123456" });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      success: false,
      message: "Too many verification attempts. Please request a new OTP",
    });
    expect(testState.redisStore.get("otp:blocked@example.com")).toBe("123456");
    expect(testState.publishToQueue).not.toHaveBeenCalled();
  });

  it("returns the current user for the /me route", async () => {
    const user = testState.buildUser({
      _id: "42",
      name: "Alice",
      email: "alice@example.com",
    });

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${signToken(user)}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Current user fetched",
      user: {
        _id: "42",
        name: "Alice",
        email: "alice@example.com",
      },
    });
  });

  it("updates the user name and republishes the user event", async () => {
    const user = testState.buildUser({
      _id: "7",
      name: "Alice",
      email: "alice@example.com",
    });

    const response = await request(app)
      .post("/api/v1/update/user")
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({ name: "Alice Updated" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("User updated");
    expect(response.body.user).toMatchObject({
      _id: "7",
      name: "Alice Updated",
      email: "alice@example.com",
    });
    expect(testState.publishToQueue).toHaveBeenCalledWith("user.events", {
      type: "user.upserted",
      payload: {
        _id: "7",
        email: "alice@example.com",
        name: "Alice Updated",
      },
    });

    const decoded = jwt.verify(response.body.token, testAuth.publicKey, {
      algorithms: ["RS256"],
      issuer: testAuth.issuer,
      audience: testAuth.audience,
    }) as jwt.JwtPayload;

    expect(decoded.user).toMatchObject({
      _id: "7",
      name: "Alice Updated",
      email: "alice@example.com",
    });
  });
});
