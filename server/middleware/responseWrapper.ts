import type { Request, Response, NextFunction } from "express";

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

/**
 * Augment Express Response with typed JSON envelope helpers.
 * `res.ok(data)` → 200 JSON { success: true, data }
 * `res.fail(code, message, status, details)` → JSON { success: false, error }
 */
export function responseWrapper(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.ok = function <T>(this: Response, data: T, status = 200) {
    return this.status(status).json({
      success: true,
      data,
    } satisfies ApiSuccess<T>);
  };

  res.fail = function (
    this: Response,
    code: string,
    message: string,
    status = 400,
    details?: unknown,
  ) {
    return this.status(status).json({
      success: false,
      error: { code, message, ...(details !== undefined && { details }) },
    } satisfies ApiError);
  };

  next();
}
