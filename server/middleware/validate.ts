import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.fail(
        "ROUND1_VALIDATION_ERROR",
        "请求参数校验失败",
        400,
        result.error.flatten().fieldErrors,
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
