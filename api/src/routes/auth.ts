import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../db.js";
import { COOKIE, isAdminRole, loadUser, requireAuth, setSession, weakPin } from "../auth.js";
import { HttpError, wrap } from "../http.js";

export const authRouter = Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Too many attempts. Try again in 15 minutes." },
});

const mobile = z.string().regex(/^\d{10}$/, "Mobile must be 10 digits");
const pin = z.string().regex(/^(\d{4}|\d{6})$/, "PIN must be 4 or 6 digits");

export const publicUser = (u: any) => ({
  id: u.id, fullName: u.fullName, mobile: u.mobile, username: u.username, role: u.role, email: u.email,
  dob: u.dob ? u.dob.toISOString().slice(0, 10) : null, playingRole: u.playingRole, skillLevel: u.skillLevel, mustChangePin: u.mustChangePin,
});

authRouter.post("/signup", loginLimiter, wrap(async (req, res) => {
  const b = z.object({
    fullName: z.string().trim().min(2, "Enter your full name").max(80),
    mobile,
    username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/, "Username: 3-20 letters, digits or underscore").optional().or(z.literal("").transform(() => undefined)),
    pin, pin2: z.string(),
    email: z.string().email().optional().or(z.literal("").transform(() => undefined)),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
    playingRole: z.enum(["batsman", "bowler", "all-rounder", "keeper"]).optional(),
    skillLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  }).parse(req.body);
  if (b.pin !== b.pin2) throw new HttpError(400, "PINs do not match");
  const weak = weakPin(b.pin, b.mobile);
  if (weak) throw new HttpError(400, weak);
  if (/^\d{10}$/.test(b.username ?? "")) throw new HttpError(400, "Username cannot be a 10-digit number");

  if (await prisma.user.findUnique({ where: { mobile: b.mobile } })) throw new HttpError(409, "This mobile number is already registered. Please log in.");
  if (b.username && (await prisma.user.findFirst({ where: { username: { equals: b.username, mode: "insensitive" } } })))
    throw new HttpError(409, "That username is taken");

  const user = await prisma.user.create({
    data: {
      fullName: b.fullName, mobile: b.mobile, username: b.username ?? null, pinHash: await bcrypt.hash(b.pin, 10), role: "user",
      email: b.email ?? null, dob: b.dob ? new Date(`${b.dob}T00:00:00Z`) : null, playingRole: b.playingRole ?? null, skillLevel: b.skillLevel ?? null,
    },
  });
  setSession(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

authRouter.post("/login", loginLimiter, wrap(async (req, res) => {
  const b = z.object({ identifier: z.string().trim().min(1, "Enter your mobile number or username"), pin: z.string().min(1, "Enter your PIN") }).parse(req.body);
  const user = /^\d{10}$/.test(b.identifier)
    ? await prisma.user.findUnique({ where: { mobile: b.identifier } })
    : await prisma.user.findFirst({ where: { username: { equals: b.identifier, mode: "insensitive" } } });
  const bad = new HttpError(401, "Wrong mobile/username or PIN");
  if (!user || !user.isActive) throw bad;

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new HttpError(423, `Account locked. Try again in ${mins} min, or ask the nets to unlock it.`, { code: "LOCKED" });
  }
  if (!(await bcrypt.compare(b.pin, user.pinHash))) {
    const attempts = user.failedAttempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: lock ? 0 : attempts, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : null },
    });
    if (lock) throw new HttpError(423, `Too many wrong PINs. Account locked for ${LOCK_MINUTES} minutes.`, { code: "LOCKED" });
    throw new HttpError(401, `Wrong mobile/username or PIN (${MAX_ATTEMPTS - attempts} tries left)`);
  }
  if (user.failedAttempts || user.lockedUntil) await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
  setSession(res, user);
  res.json({ user: publicUser(user), home: isAdminRole(user.role) ? "/admin" : "/home" });
}));

authRouter.post("/logout", (_req, res) => { res.clearCookie(COOKIE, { path: "/" }); res.json({ ok: true }); });

authRouter.get("/me", loadUser, wrap(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json({ user: publicUser(u) });
}));

authRouter.post("/change-pin", loadUser, requireAuth, loginLimiter, wrap(async (req, res) => {
  const b = z.object({ oldPin: z.string().min(1), newPin: pin }).parse(req.body);
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(b.oldPin, u.pinHash))) throw new HttpError(401, "Current PIN is wrong");
  if (b.oldPin === b.newPin) throw new HttpError(400, "New PIN must be different");
  if (isAdminRole(u.role) && b.newPin.length !== 6) throw new HttpError(400, "Admins must use a 6-digit PIN");
  const weak = weakPin(b.newPin, u.mobile);
  if (weak) throw new HttpError(400, weak);
  await prisma.user.update({ where: { id: u.id }, data: { pinHash: await bcrypt.hash(b.newPin, 10), mustChangePin: false, failedAttempts: 0, lockedUntil: null } });
  res.json({ ok: true });
}));

authRouter.patch("/profile", loadUser, requireAuth, wrap(async (req, res) => {
  const b = z.object({
    fullName: z.string().trim().min(2).max(80).optional(),
    email: z.string().email().nullable().optional().or(z.literal("").transform(() => null)),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("").transform(() => null)),
    playingRole: z.enum(["batsman", "bowler", "all-rounder", "keeper"]).nullable().optional(),
    skillLevel: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
  }).parse(req.body);
  const u = await prisma.user.update({
    where: { id: req.user!.id },
    data: { ...b, dob: b.dob === undefined ? undefined : b.dob ? new Date(`${b.dob}T00:00:00Z`) : null },
  });
  res.json({ user: publicUser(u) });
}));
