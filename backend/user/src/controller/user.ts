import { generateToken } from "../config/generateToken.js";
import { publishToQueue } from "../config/rabbitmq.js";
import TryCatch from "../config/tryCatch.js";
import { redisClient } from "../index.js";
import type { AuthenticatedRequest } from "../middlewares/isAuth.js";
import { User } from "../model/User.js";

type JsonResponse = {
  status: (code: number) => { json: (body: unknown) => void };
  json: (body: unknown) => void;
};

const respondSuccess = (
  res: JsonResponse,
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
  res: JsonResponse,
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

const respondUnauthorized = (res: JsonResponse) => {
  respondError(res, 401, "Please login");
};

const respondNotFound = (res: JsonResponse, resource: string) => {
  respondError(res, 404, `${resource} not found`);
};

const publishUserEvent = async (user: {
  _id: any;
  name: string;
  email: string;
}) => {
  await publishToQueue("user.events", {
    type: "user.upserted",
    payload: { _id: user._id.toString(), name: user.name, email: user.email },
  });
};

export const loginUser = TryCatch(async (req, res) => {
  const { email } = req.body;
  const rateLimitKey = `otp:ratelimit: ${email}`;
  const rateLimit = await redisClient.get(rateLimitKey);
  if (rateLimit) {
    respondError(
      res,
      429,
      "Too many requests. Please wait before requesting new otp",
    );
    return;
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpKey = `otp:${email}`;

  await redisClient.set(otpKey, otp, {
    EX: 300,
  });

  await redisClient.set(rateLimitKey, "true", {
    EX: 60,
  });

  const message = {
    to: email,
    subject: "Your otp code",
    body: `Your OTP is ${otp}. It is valid for 5 minutes,`,
  };

  await publishToQueue("send-otp", message);
  respondSuccess(res, "OTP sent to your mail");
});

export const verifyUser = TryCatch(async (req, res) => {
  const { email, otp: enteredOtp } = req.body;
  const otpKey = `otp:${email}`;
  const storeOtp = await redisClient.get(otpKey);

  if (!storeOtp || storeOtp !== enteredOtp) {
    respondError(res, 400, "Invalid or expired OTP");
    return;
  }

  await redisClient.del(otpKey);
  let user = await User.findOne({ email });

  if (!user) {
    const name = email.slice(0, 8);
    user = await User.create({ name, email });
  }

  await publishUserEvent(user);

  const token = generateToken(user);
  respondSuccess(res, "User verified", {
    user,
    token,
  });
});

export const myProfile = TryCatch(async (req: AuthenticatedRequest, res) => {
  const user = req.user;

  if (!user) {
    respondUnauthorized(res);
    return;
  }

  respondSuccess(res, "Current user fetched", { user });
});

export const updateName = TryCatch(async (req: AuthenticatedRequest, res) => {
  if (!req.user?._id) {
    respondUnauthorized(res);
    return;
  }

  const user = await User.findById(req.user?._id);

  if (!user) {
    respondUnauthorized(res);
    return;
  }

  user.name = req.body.name;
  await user.save();

  await publishUserEvent(user);

  const token = generateToken(user);
  respondSuccess(res, "User updated", {
    user,
    token,
  });
});

export const getAllUsers = TryCatch(async (req: AuthenticatedRequest, res) => {
  if (!req.user?._id) {
    respondUnauthorized(res);
    return;
  }

  const users = await User.find();
  respondSuccess(res, "Users fetched", { users });
});

export const getAUser = TryCatch(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    respondNotFound(res, "User");
    return;
  }

  respondSuccess(res, "User fetched", { user });
});
