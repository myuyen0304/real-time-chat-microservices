import type { NextFunction, Request, RequestHandler, Response } from "express";

const TryCatch = (handler: RequestHandler): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (error: any) {
      if (error?.name === "CastError" || error?.name === "ValidationError") {
        res.status(422).json({
          message: "Validation failed",
          errors: [
            {
              field: error.path || "request",
              location: "body",
              message: error.message,
            },
          ],
        });
        return;
      }

      res
        .status(error?.statusCode ?? 500)
        .json({ message: error?.message ?? "Internal server error" });
    }
  };
};

export default TryCatch;
