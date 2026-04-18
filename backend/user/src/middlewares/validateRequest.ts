import type { NextFunction, Request, RequestHandler, Response } from "express";

type ValidationLocation = "body" | "params" | "query";

export interface ValidationErrorDetail {
  field: string;
  message: string;
  location: ValidationLocation;
}

export type RequestValidator = (req: Request) => ValidationErrorDetail[];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

const getStringValue = (
  req: Request,
  location: ValidationLocation,
  field: string,
): string | undefined => {
  const source = req[location] as Record<string, unknown>;
  const value = source?.[field];

  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  source[field] = normalizedValue;
  return normalizedValue;
};

export const validateRequest = (
  ...validators: RequestValidator[]
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors = validators.flatMap((validator) => validator(req));

    if (errors.length > 0) {
      res.status(422).json({
        message: "Validation failed",
        errors,
      });
      return;
    }

    next();
  };
};

export const validateEmail = (field = "email"): RequestValidator => {
  return (req) => {
    const source = req.body as Record<string, unknown>;

    if (typeof source?.[field] !== "string") {
      return [{ field, location: "body", message: "Email is required" }];
    }

    const email = getStringValue(req, "body", field)?.toLowerCase();
    source[field] = email ?? source[field];

    if (!email) {
      return [{ field, location: "body", message: "Email is required" }];
    }

    if (!EMAIL_REGEX.test(email)) {
      return [{ field, location: "body", message: "Email format is invalid" }];
    }

    return [];
  };
};

export const validateOtp = (field = "otp"): RequestValidator => {
  return (req) => {
    const otp = getStringValue(req, "body", field);

    if (!otp) {
      return [{ field, location: "body", message: "OTP is required" }];
    }

    if (!/^\d{6}$/.test(otp)) {
      return [
        {
          field,
          location: "body",
          message: "OTP must be a 6-digit number",
        },
      ];
    }

    return [];
  };
};

export const validateName = (field = "name"): RequestValidator => {
  return (req) => {
    const name = getStringValue(req, "body", field);

    if (!name) {
      return [{ field, location: "body", message: "Name is required" }];
    }

    if (name.length < 2) {
      return [
        {
          field,
          location: "body",
          message: "Name must be at least 2 characters long",
        },
      ];
    }

    if (name.length > 30) {
      return [
        {
          field,
          location: "body",
          message: "Name must not exceed 30 characters",
        },
      ];
    }

    return [];
  };
};

export const validateMongoIdParam = (
  field: string,
  label: string,
): RequestValidator => {
  return (req) => {
    const value = getStringValue(req, "params", field);

    if (!value) {
      return [{ field, location: "params", message: `${label} is required` }];
    }

    if (!OBJECT_ID_REGEX.test(value)) {
      return [
        {
          field,
          location: "params",
          message: `${label} must be a valid MongoDB id`,
        },
      ];
    }

    return [];
  };
};
