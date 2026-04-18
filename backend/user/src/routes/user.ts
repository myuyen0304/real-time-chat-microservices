import express from "express";
import {
  getAllUsers,
  getAUser,
  loginUser,
  myProfile,
  updateName,
  verifyUser,
} from "../controller/user.js";
import { isAuth } from "../middlewares/isAuth.js";
import {
  validateEmail,
  validateMongoIdParam,
  validateName,
  validateOtp,
  validateRequest,
} from "../middlewares/validateRequest.js";

const router = express.Router();

router.post("/login", validateRequest(validateEmail()), loginUser);
router.post(
  "/verify",
  validateRequest(validateEmail(), validateOtp()),
  verifyUser,
);
router.get("/me", isAuth, myProfile);
router.get("/user/all", isAuth, getAllUsers);
router.get(
  "/user/:id",
  validateRequest(validateMongoIdParam("id", "User id")),
  getAUser,
);
router.post(
  "/update/user",
  isAuth,
  validateRequest(validateName()),
  updateName,
);

export default router;
