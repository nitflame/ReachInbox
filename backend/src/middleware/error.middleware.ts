import type { NextFunction, Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("❌ Unhandled error:", err);
  const message = err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({ error: "Internal Server Error", message });
}
