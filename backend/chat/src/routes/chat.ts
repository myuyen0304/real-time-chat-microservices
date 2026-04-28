import express from "express";
import isAuth from "../middleware/isAuth.js";
import {
  addGroupMember,
  createNewChat,
  deleteMessage,
  getAllChats,
  getMessageByChat,
  leaveGroupChat,
  removeGroupMember,
  searchChatsAndMessages,
  sendMessage,
  updateMessage,
  updateGroupMetadata,
  uploadGroupAvatar,
} from "../controller/chat.js";
import {
  parseGroupAvatarUpload,
  parseMessageUpload,
} from "../middleware/multer.js";
import {
  type RequestValidator,
  validateBodyMongoId,
  validateOptionalText,
  validateParamMongoId,
  validateRequest,
  validateTextOrImage,
} from "../middleware/validateRequest.js";

const router = express.Router();

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const isMongoId = (value: string) => OBJECT_ID_REGEX.test(value);

const validateCreateChatPayload: RequestValidator = (req) => {
  const request = req as typeof req & {
    body: {
      chatType?: unknown;
      otherUserId?: unknown;
      userIds?: unknown;
      groupName?: unknown;
      groupAvatar?: unknown;
    };
    user?: { _id?: string };
  };

  const rawChatType =
    typeof request.body.chatType === "string"
      ? request.body.chatType.trim()
      : "";
  const currentUserId = request.user?._id?.toString();

  if (rawChatType && rawChatType !== "direct" && rawChatType !== "group") {
    return [
      {
        field: "chatType",
        location: "body",
        message: "Chat type must be either direct or group",
      },
    ];
  }

  const chatType = rawChatType === "group" ? "group" : "direct";
  if (request.body.chatType !== undefined) {
    request.body.chatType = chatType;
  }

  if (chatType === "group") {
    const errors = [] as ReturnType<RequestValidator>;

    if (typeof request.body.groupName !== "string") {
      errors.push({
        field: "groupName",
        location: "body",
        message: "Group name is required",
      });
    } else {
      request.body.groupName = request.body.groupName.trim();
      if (!request.body.groupName) {
        errors.push({
          field: "groupName",
          location: "body",
          message: "Group name is required",
        });
      }
    }

    if (request.body.groupAvatar !== undefined) {
      if (typeof request.body.groupAvatar !== "string") {
        errors.push({
          field: "groupAvatar",
          location: "body",
          message: "Group avatar must be a string",
        });
      } else {
        request.body.groupAvatar = request.body.groupAvatar.trim();
        if (request.body.groupAvatar) {
          try {
            const parsed = new URL(request.body.groupAvatar);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
              errors.push({
                field: "groupAvatar",
                location: "body",
                message: "Group avatar must be an HTTP or HTTPS URL",
              });
            }
          } catch {
            errors.push({
              field: "groupAvatar",
              location: "body",
              message: "Group avatar must be a valid URL",
            });
          }
        }
      }
    }

    if (
      !Array.isArray(request.body.userIds) ||
      request.body.userIds.length === 0
    ) {
      errors.push({
        field: "userIds",
        location: "body",
        message: "User ids are required for group chats",
      });
      return errors;
    }

    request.body.userIds = request.body.userIds.map((value: unknown) =>
      typeof value === "string" ? value.trim() : value,
    );

    request.body.userIds.forEach((value: unknown, index: number) => {
      if (typeof value !== "string" || !isMongoId(value)) {
        errors.push({
          field: `userIds[${index}]`,
          location: "body",
          message: "Each user id must be a valid MongoDB id",
        });
      }
    });

    const normalizedUserIds = request.body.userIds.filter(
      (value: unknown): value is string =>
        typeof value === "string" && isMongoId(value),
    );

    if (
      currentUserId &&
      normalizedUserIds.length > 0 &&
      normalizedUserIds.every((value: string) => value === currentUserId)
    ) {
      errors.push({
        field: "userIds",
        location: "body",
        message: "Group chats must include at least one other user",
      });
    }

    return errors;
  }

  if (typeof request.body.otherUserId !== "string") {
    return [
      {
        field: "otherUserId",
        location: "body",
        message: "Other user id is required",
      },
    ];
  }

  request.body.otherUserId = request.body.otherUserId.trim();

  if (!request.body.otherUserId) {
    return [
      {
        field: "otherUserId",
        location: "body",
        message: "Other user id is required",
      },
    ];
  }

  if (!isMongoId(request.body.otherUserId)) {
    return [
      {
        field: "otherUserId",
        location: "body",
        message: "Other user id must be a valid MongoDB id",
      },
    ];
  }

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

const validateGroupMetadataPayload: RequestValidator = (req) => {
  const request = req as typeof req & {
    body: {
      groupName?: unknown;
      groupAvatar?: unknown;
    };
  };
  const errors = [] as ReturnType<RequestValidator>;
  const hasGroupName = request.body.groupName !== undefined;
  const hasGroupAvatar = request.body.groupAvatar !== undefined;

  if (!hasGroupName && !hasGroupAvatar) {
    errors.push({
      field: "groupName",
      location: "body",
      message: "Group name or group avatar is required",
    });
    return errors;
  }

  if (hasGroupName) {
    if (typeof request.body.groupName !== "string") {
      errors.push({
        field: "groupName",
        location: "body",
        message: "Group name must be a string",
      });
    } else {
      request.body.groupName = request.body.groupName.trim();
      if (!request.body.groupName) {
        errors.push({
          field: "groupName",
          location: "body",
          message: "Group name cannot be empty",
        });
      }
    }
  }

  if (hasGroupAvatar) {
    if (typeof request.body.groupAvatar !== "string") {
      errors.push({
        field: "groupAvatar",
        location: "body",
        message: "Group avatar must be a string",
      });
    } else {
      request.body.groupAvatar = request.body.groupAvatar.trim();
      if (request.body.groupAvatar) {
        try {
          const parsed = new URL(request.body.groupAvatar);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            errors.push({
              field: "groupAvatar",
              location: "body",
              message: "Group avatar must be an HTTP or HTTPS URL",
            });
          }
        } catch {
          errors.push({
            field: "groupAvatar",
            location: "body",
            message: "Group avatar must be a valid URL",
          });
        }
      }
    }
  }

  return errors;
};

const validateSearchQuery: RequestValidator = (req) => {
  const request = req as typeof req & {
    query: {
      q?: unknown;
    };
  };

  if (typeof request.query.q !== "string") {
    return [
      {
        field: "q",
        location: "query",
        message: "Search query is required",
      },
    ];
  }

  const query = request.query.q.trim();
  request.query.q = query;
  if (!query) {
    return [
      {
        field: "q",
        location: "query",
        message: "Search query is required",
      },
    ];
  }

  if (query.length > 100) {
    return [
      {
        field: "q",
        location: "query",
        message: "Search query must be at most 100 characters",
      },
    ];
  }

  return [];
};

const validateMessageUpdatePayload: RequestValidator = (req) => {
  const request = req as typeof req & {
    body: {
      text?: unknown;
    };
  };

  if (typeof request.body.text !== "string") {
    return [
      {
        field: "text",
        location: "body",
        message: "Text is required",
      },
    ];
  }

  request.body.text = request.body.text.trim();
  if (!request.body.text) {
    return [
      {
        field: "text",
        location: "body",
        message: "Text is required",
      },
    ];
  }

  return [];
};

router.post(
  "/chat/new",
  isAuth,
  validateRequest(validateCreateChatPayload),
  createNewChat,
);
router.get("/chat/all", isAuth, getAllChats);
router.get(
  "/chat/search",
  isAuth,
  validateRequest(validateSearchQuery),
  searchChatsAndMessages,
);
router.post(
  "/chat/:chatId/members",
  isAuth,
  validateRequest(
    validateParamMongoId("chatId", "Chat id"),
    validateBodyMongoId("memberId", "Member id"),
  ),
  addGroupMember,
);
router.delete(
  "/chat/:chatId/members/:memberId",
  isAuth,
  validateRequest(
    validateParamMongoId("chatId", "Chat id"),
    validateParamMongoId("memberId", "Member id"),
  ),
  removeGroupMember,
);
router.post(
  "/chat/:chatId/leave",
  isAuth,
  validateRequest(validateParamMongoId("chatId", "Chat id")),
  leaveGroupChat,
);
router.patch(
  "/chat/:chatId/group",
  isAuth,
  validateRequest(
    validateParamMongoId("chatId", "Chat id"),
    validateGroupMetadataPayload,
  ),
  updateGroupMetadata,
);
router.patch(
  "/chat/:chatId/avatar",
  isAuth,
  parseGroupAvatarUpload,
  validateRequest(validateParamMongoId("chatId", "Chat id")),
  uploadGroupAvatar,
);
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
router.patch(
  "/message/:messageId",
  isAuth,
  validateRequest(
    validateParamMongoId("messageId", "Message id"),
    validateMessageUpdatePayload,
  ),
  updateMessage,
);
router.delete(
  "/message/:messageId",
  isAuth,
  validateRequest(validateParamMongoId("messageId", "Message id")),
  deleteMessage,
);
router.get(
  "/message/:chatId",
  isAuth,
  validateRequest(validateParamMongoId("chatId", "Chat id")),
  getMessageByChat,
);

export default router;
