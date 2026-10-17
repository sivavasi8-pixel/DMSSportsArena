import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config, isProd } from "./config.js";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";

export type AuthUser = { id: number; role: string; fullName: string; mobile: string; mustChangePin: boolean };
declare global { namespace Express { interface Request { user?: AuthUser } } }

export const COOKIE = "dms_session";
export const isAdminRole = (r: string) => r === "admin" || r === "super_admin";

export function setSession(res: Response, user: { id: number; role: string }) {
  const admin = isAdminRole(user.role);
  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: admin ? "12h" : "30d" });
  res.cookie(COOKIE, token, {
    httpOnly: true, secure: isProd, sameSite: "lax",
    maxAge: (admin ? 12 : 24 * 30) * 3600 * 1000, path: "/",
  });
}

/** Loads the user fresh from the DB on every request so deactivation/role changes apply at once. */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) {
      const p = jwt.verify(token, config.jwtSecret) as unknown as { sub: number };
      const u = await prisma.user.findUnique({ where: { id: p.sub } });
      if (u && u.isActive) req.user = { id: u.id, role: u.role, fullName: u.fullName, mobile: u.mobile, mustChangePin: u.mustChangePin };
    }
  } catch { /* invalid or expired token = anonymous */ }
  next();
}
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Please log in"));
  next();
}
/** Blocks everything except change-pin/me/logout while a temporary PIN is active. */
export function requirePinChanged(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.mustChangePin) return next(new HttpError(403, "Please set a new PIN first", { code: "MUST_CHANGE_PIN" }));
  next();
}
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Please log in"));
  if (!isAdminRole(req.user.role)) return next(new HttpError(403, "Admins only"));
  next();
}
export function requireSuper(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "super_admin") return next(new HttpError(403, "Owner only"));
  next();
}

export async function audit(actorId: number | undefined, action: string, entity: string, entityId?: string | number, details?: unknown) {
  await prisma.auditLog.create({
    data: { actorId: actorId ?? null, action, entity, entityId: entityId == null ? null : String(entityId), details: (details ?? undefined) as any },
  });
}

// PIN rules
export function weakPin(pin: string, mobile?: string): string | null {
  if (!/^(\d{4}|\d{6})$/.test(pin)) return "PIN must be 4 or 6 digits";
  if (/^(\d)\1+$/.test(pin)) return "PIN is too easy (repeated digits)";
  const asc = "0123456789", desc = "9876543210";
  if (asc.includes(pin) || desc.includes(pin)) return "PIN is too easy (sequence)";
  if (pin === "0000" || pin === "000000") return "PIN is too easy";
  if (mobile && mobile.endsWith(pin)) return "PIN must not be the end of your mobile number";
  return null;
}
