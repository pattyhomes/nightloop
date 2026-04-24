import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export type ErrorDetails = Record<string, unknown>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ErrorDetails;

  constructor(status: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validationError(message: string, details?: ErrorDetails): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", message, details);
}

export function notFoundError(message = "Resource not found."): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function toValidationError(error: ZodError): ApiError {
  const details = error.issues.reduce<Record<string, string>>((acc, issue) => {
    const path = issue.path.join(".");
    acc[path.length > 0 ? path : "body"] = issue.message;
    return acc;
  }, {});

  return validationError("Request validation failed.", details);
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res, next).catch(next);
  };
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    });
    return;
  }

  if (error instanceof ZodError) {
    const apiError = toValidationError(error);
    res.status(apiError.status).json({
      error: {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details
      }
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("[api] unexpected error", { message });
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected server error."
    }
  });
}
