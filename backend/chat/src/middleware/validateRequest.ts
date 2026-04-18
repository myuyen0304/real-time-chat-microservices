import type { NextFunction, Request, RequestHandler, Response } from "express";

type ValidationLocation = "body" | "params" | "query";

export interface ValidationErrorDetail {
  field: string;
  message: string;
  location: ValidationLocation;
}

export type RequestValidator = (req: Request) => ValidationErrorDetail[];

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

export const validateBodyMongoId = (
  field: string,
  label: string,
): RequestValidator => {
  return (req) => {
    const value = getStringValue(req, "body", field);

    if (!value) {
      return [{ field, location: "body", message: `${label} is required` }];
    }

    if (!OBJECT_ID_REGEX.test(value)) {
      return [
        {
          field,
          location: "body",
          message: `${label} must be a valid MongoDB id`,
        },
      ];
    }

    return [];
  };
};

export const validateParamMongoId = (
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

export const validateOptionalText = (field = "text"): RequestValidator => {
  return (req) => {
    const source = req.body as Record<string, unknown>;
    const value = source?.[field];

    if (value === undefined || value === null) {
      return [];
    }

    if (typeof value !== "string") {
      return [
        {
          field,
          location: "body",
          message: "Text must be a string",
        },
      ];
    }

    source[field] = value.trim();
    return [];
  };
};

export const validateTextOrImage = (field = "text"): RequestValidator => {
  return (req) => {
    const value =
      typeof req.body?.[field] === "string" ? req.body[field].trim() : "";
    const hasImage = Boolean(
      (req as Request & { file?: Express.Multer.File }).file,
    );

    if (!value && !hasImage) {
      return [
        {
          field,
          location: "body",
          message: "Either text or image is required",
        },
      ];
    }

    return [];
  };
};
