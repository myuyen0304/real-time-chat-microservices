import express from "express";
import isAuth from "../middleware/isAuth.js";
import {
  acceptVideoCall,
  declineVideoCall,
  endVideoCall,
  initiateVideoCall,
} from "../controller/call.js";
import {
  validateBodyMongoId,
  validateParamMongoId,
  validateRequest,
} from "../middleware/validateRequest.js";

const router = express.Router();

router.post(
  "/call/initiate",
  isAuth,
  validateRequest(validateBodyMongoId("chatId", "Chat id")),
  initiateVideoCall,
);
router.post(
  "/call/:callId/accept",
  isAuth,
  validateRequest(validateParamMongoId("callId", "Call id")),
  acceptVideoCall,
);
router.post(
  "/call/:callId/decline",
  isAuth,
  validateRequest(validateParamMongoId("callId", "Call id")),
  declineVideoCall,
);
router.post(
  "/call/:callId/end",
  isAuth,
  validateRequest(validateParamMongoId("callId", "Call id")),
  endVideoCall,
);

export default router;
