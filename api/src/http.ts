import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}
export const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input", issues: err.issues });
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
}
