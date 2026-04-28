import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import multerStorageCloudinary from "multer-storage-cloudinary";

import cloudinary from "../config/cloudinary.js";

const CloudinaryStorage =
  multerStorageCloudinary.CloudinaryStorage || multerStorageCloudinary;

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "chat-images",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [
      { width: 800, height: 600, crop: "limit" },
      { quality: "auto" },
    ],
  } as any,
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, callback) => {
    if (file.mimetype.startsWith("image/")) {
      callback(null, true);
    } else {
      callback(new Error("Only images allowed"));
    }
  },
});

export const parseMessageUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.is("multipart/form-data")) {
    next();
    return;
  }

  upload.single("image")(req, res, next);
};

export const parseGroupAvatarUpload = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.is("multipart/form-data")) {
    next();
    return;
  }

  upload.single("avatar")(req, res, next);
};
