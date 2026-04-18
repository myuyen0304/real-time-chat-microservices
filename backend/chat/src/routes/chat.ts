import express from "express";
import isAuth from "../middleware/isAuth.js";
import {
  createNewChat,
  getAllChats,
  getMessageByChat,
  sendMessage,
} from "../controller/chat.js";
import { parseMessageUpload } from "../middleware/multer.js";
import {
  type RequestValidator,
  validateBodyMongoId,
  validateOptionalText,
  validateParamMongoId,
  validateRequest,
  validateTextOrImage,
} from "../middleware/validateRequest.js";

const router = express.Router();

const validateOtherUserIdIsNotCurrentUser: RequestValidator = (req) => {
  const request = req as typeof req & {
    body: { otherUserId?: string };
    user?: { _id?: string };
  };

  if (request.body.otherUserId === request.user?._id?.toString()) {
    return [
      {
        field: "otherUserId",
        location: "body",
        message: "Other user id must be different from your user id",
      },
    ];
  }

  return [];
};

router.post(
  "/chat/new",
  isAuth,
  validateRequest(
    validateBodyMongoId("otherUserId", "Other user id"),
    validateOtherUserIdIsNotCurrentUser,
  ),
  createNewChat,
);
router.get("/chat/all", isAuth, getAllChats);
router.post(
  "/message",
  isAuth,
  parseMessageUpload,
  validateRequest(
    validateBodyMongoId("chatId", "Chat id"),
    validateOptionalText("text"),
    validateTextOrImage("text"),
  ),
  sendMessage,
);
router.get(
  "/message/:chatId",
  isAuth,
  validateRequest(validateParamMongoId("chatId", "Chat id")),
  getMessageByChat,
);

export default router;
