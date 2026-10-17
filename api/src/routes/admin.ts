import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import crypto from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { audit, loadUser, requireAdmin, requirePinChanged, requireSuper } from "../auth.js";
import { HttpError, wrap } from "../http.js";
import { confirmHolds, getSettings, holdSlots, shape } from "../services/bookings.js";
import { loadDay } from "../services/slots.js";
import { addDays, dateOnly, dateStr, isDateStr, istNow, toMin } from "../time.js";
import { publicUser } from "./auth.js";

export const adminRouter = Router();
adminRouter.use(loadUser, requireAdmin, requirePinChanged);

const idParam = (v: unknown) => { const n = Number(v); if (!Number.isInteger(n)) throw new HttpError(400, "Bad id"); return n; };
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const csv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }).join(",")).join("\n");
const tempPin = () => String(100000 + crypto.randomInt(0, 900000)).replace(/^(\d)\1{5}$/, "482916");

// ---------- Dashboard ----------
adminRouter.get("/dashboard", wrap(async (_req, res) => {
  const { date: today, minutes } = istNow();
  const monthStart = `${today.slice(0, 8)}01`;
  const [todayRows, monthPaid, verifyCount, last7] = await Promise.all([
    prisma.booking.findMany({ where: { slotDate: dateOnly(today), status: { in: ["confirmed", "completed", "no_show"] } }, include: { resource: true, user: true }, orderBy: { startTime: "asc" } }),
    prisma.booking.aggregate({ _sum: { amountInr: true }, where: { slotDate: { gte: dateOnly(monthStart), lte: dateOnly(today) }, paymentStatus: "paid", status: { in: ["confirmed", "completed", "no_show"] } } }),
    prisma.booking.count({ where: { paymentStatus: "verification", status: "confirmed" } }),
    prisma.booking.groupBy({ by: ["slotDate"], _count: true, where: { slotDate: { gte: dateOnly(addDays(today, -6)), lte: dateOnly(today) }, status: { in: ["confirmed", "completed", "no_show"] } } }),
  ]);
  const day = await loadDay(today);
  let total = 0;
  for (const r of day.resources) total += day.slotsFor(r).filter((s) => !day.blockFor(r.id, s)).length;
  const nowStr = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const chart = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 6);
    const hit = last7.find((g) => dateStr(g.slotDate) === d);
    return { date: d, count: hit?._count ?? 0 };
  });
  res.json({
    todayCount: todayRows.length,
    revenueToday: todayRows.filter((b) => b.paymentStatus === "paid").reduce((a, b) => a + b.amountInr, 0),
    revenueMonth: monthPaid._sum.amountInr ?? 0,
    occupancy: total ? Math.round((todayRows.length / total) * 100) : 0,
    toVerify: verifyCount,
    next: todayRows.filter((b) => b.endTime > nowStr).slice(0, 3).map(shape),
    chart,
  });
}));

// ---------- Bookings ----------
function bookingWhere(q: any): Prisma.BookingWhereInput {
  const w: Prisma.BookingWhereInput = { status: { not: "held" } };
  if (isDateStr(q.from) || isDateStr(q.to)) w.slotDate = { ...(isDateStr(q.from) ? { gte: dateOnly(q.from) } : {}), ...(isDateStr(q.to) ? { lte: dateOnly(q.to) } : {}) };
  if (q.resourceId) w.resourceId = Number(q.resourceId);
  if (q.status) w.status = String(q.status);
  if (q.paymentStatus) w.paymentStatus = String(q.paymentStatus);
  if (q.q) {
    const s = String(q.q);
    w.OR = [
      { bookingCode: { contains: s, mode: "insensitive" } },
      { user: { fullName: { contains: s, mode: "insensitive" } } },
      { user: { mobile: { contains: s } } },
      { upiRef: { contains: s } },
    ];
  }
  return w;
}

adminRouter.get("/bookings", wrap(async (req, res) => {
  const rows = await prisma.booking.findMany({
    where: bookingWhere(req.query), include: { resource: true, user: true },
    orderBy: [{ slotDate: "desc" }, { startTime: "desc" }], take: Math.min(Number(req.query.limit ?? 300), 2000),
  });
  if (req.query.format === "csv") {
    res.set({ "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="bookings.csv"' });
    return void res.send(csv([
      ["Code", "Date", "Start", "End", "Resource", "Player", "Mobile", "Status", "Amount", "Payment mode", "Payment status", "Paid via", "UTR"],
      ...rows.map((b) => [b.bookingCode, dateStr(b.slotDate), b.startTime, b.endTime, b.resource.name, b.user.fullName, b.user.mobile, b.status, b.amountInr, b.paymentMode, b.paymentStatus, b.paidVia, b.upiRef]),
    ]));
  }
  res.json({ bookings: rows.map(shape) });
}));

adminRouter.post("/bookings", wrap(async (req, res) => {
  const b = z.object({
    userId: z.number().int().optional(),
    newUser: z.object({ fullName: z.string().trim().min(2), mobile: z.string().regex(/^\d{10}$/, "Mobile must be 10 digits") }).optional(),
    slots: z.array(z.object({ resourceId: z.number().int(), date, start: time })).min(1).max(10),
    paymentMode: z.enum(["upi", "at_nets"]).default("at_nets"),
    paid: z.enum(["cash", "upi"]).optional(),
    notes: z.string().max(300).optional(),
  }).parse(req.body);

  let userId = b.userId;
  let createdUser: { id: number; tempPin: string } | undefined;
  if (!userId) {
    if (!b.newUser) throw new HttpError(400, "Choose a player or add a new one");
    const existing = await prisma.user.findUnique({ where: { mobile: b.newUser.mobile } });
    if (existing) userId = existing.id;
    else {
      const pin = tempPin();
      const u = await prisma.user.create({ data: { fullName: b.newUser.fullName, mobile: b.newUser.mobile, pinHash: await bcrypt.hash(pin, 10), mustChangePin: true } });
      userId = u.id; createdUser = { id: u.id, tempPin: pin };
    }
  }
  const holds = await holdSlots(userId, b.slots, { byAdmin: true, createdBy: _adminId(req) });
  const rows = await confirmHolds(userId, holds.map((h) => h.id), b.paymentMode, undefined, b.paid ? { via: b.paid } : b.paymentMode === "upi" ? { via: "upi" } : undefined);
  if (b.notes) await prisma.booking.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { notes: b.notes } });
  await audit(_adminId(req), "booking.create", "booking", rows.map((r) => r.code).join(","), { userId, walkIn: true });
  res.status(201).json({ bookings: rows, createdUser });
}));
const _adminId = (req: any) => req.user!.id as number;

adminRouter.patch("/bookings/:id", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({
    status: z.enum(["confirmed", "cancelled", "completed", "no_show"]).optional(),
    paymentStatus: z.enum(["pending", "verification", "paid", "rejected", "refunded"]).optional(),
    paidVia: z.enum(["cash", "upi"]).optional(),
    notes: z.string().max(300).optional(),
    move: z.object({ resourceId: z.number().int(), date, start: time }).optional(),
  }).parse(req.body);
  const cur = await prisma.booking.findUnique({ where: { id } });
  if (!cur || cur.status === "held") throw new HttpError(404, "Booking not found");

  const data: Prisma.BookingUpdateInput = {};
  if (b.status) data.status = b.status;
  if (b.paymentStatus) data.paymentStatus = b.paymentStatus;
  if (b.paidVia) data.paidVia = b.paidVia;
  if (b.notes !== undefined) data.notes = b.notes;
  if (b.paymentStatus === "paid" && !b.paidVia && !cur.paidVia) data.paidVia = cur.paymentMode === "upi" ? "upi" : "cash";
  if (b.move) {
    const day = await loadDay(b.move.date);
    const res0 = day.resources.find((r) => r.id === b.move!.resourceId);
    const slot = res0 && day.slotsFor(res0).find((s) => s.start === b.move!.start);
    if (!res0 || !slot || day.blockFor(res0.id, slot)) throw new HttpError(409, "That slot is not available");
    Object.assign(data, { resource: { connect: { id: res0.id } }, slotDate: dateOnly(b.move.date), startTime: slot.start, endTime: slot.end });
  }
  try {
    await prisma.booking.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "That slot is already taken");
    throw e;
  }
  await audit(_adminId(req), "booking.update", "booking", cur.bookingCode, b);
  const fresh = await prisma.booking.findUniqueOrThrow({ where: { id }, include: { resource: true, user: true } });
  res.json({ booking: shape(fresh) });
}));

// ---------- Blocks ----------
adminRouter.get("/blocks", wrap(async (_req, res) => {
  const rows = await prisma.slotBlock.findMany({ where: { blockDate: { gte: dateOnly(istNow().date) } }, include: { resource: true }, orderBy: [{ blockDate: "asc" }, { startTime: "asc" }] });
  res.json({ blocks: rows.map((b) => ({ id: b.id, date: dateStr(b.blockDate), start: b.startTime, end: b.endTime, reason: b.reason, resource: b.resource ? { id: b.resource.id, name: b.resource.name } : null })) });
}));

adminRouter.post("/blocks", wrap(async (req, res) => {
  const b = z.object({
    resourceIds: z.array(z.number().int()).nullable(), // null = all
    from: date, to: date, start: time, end: time, reason: z.string().max(100).optional(),
    cancelBookings: z.boolean().optional(),
  }).parse(req.body);
  if (toMin(b.end) <= toMin(b.start)) throw new HttpError(400, "End time must be after start time");
  if (b.to < b.from) throw new HttpError(400, "End date is before start date");
  const dates: string[] = [];
  for (let d = b.from; d <= b.to && dates.length < 62; d = addDays(d, 1)) dates.push(d);
  const targets: (number | null)[] = b.resourceIds && b.resourceIds.length ? b.resourceIds : [null];

  const conflicts = (await prisma.booking.findMany({
    where: {
      slotDate: { in: dates.map(dateOnly) }, status: { in: ["confirmed", "held"] },
      ...(targets[0] === null ? {} : { resourceId: { in: targets as number[] } }),
    },
    include: { resource: true, user: true },
  })).filter((c) => toMin(c.startTime) < toMin(b.end) && toMin(c.endTime) > toMin(b.start));

  if (conflicts.length && !b.cancelBookings)
    throw new HttpError(409, `${conflicts.length} booking(s) overlap this block`, { code: "HAS_BOOKINGS", bookings: conflicts.map(shape) });
  if (conflicts.length) await prisma.booking.updateMany({ where: { id: { in: conflicts.map((c) => c.id) } }, data: { status: "cancelled" } });

  await prisma.slotBlock.createMany({
    data: dates.flatMap((d) => targets.map((rid) => ({ resourceId: rid, blockDate: dateOnly(d), startTime: b.start, endTime: b.end, reason: b.reason ?? null, createdBy: _adminId(req) }))),
  });
  await audit(_adminId(req), "block.create", "slot_block", undefined, { ...b, cancelled: conflicts.map((c) => c.bookingCode) });
  res.status(201).json({ ok: true, cancelled: conflicts.map(shape) });
}));

adminRouter.delete("/blocks/:id", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  await prisma.slotBlock.delete({ where: { id } });
  await audit(_adminId(req), "block.delete", "slot_block", id);
  res.json({ ok: true });
}));

// ---------- Users ----------
adminRouter.get("/users", wrap(async (req, res) => {
  const s = req.query.q ? String(req.query.q) : "";
  const users = await prisma.user.findMany({
    where: s ? { OR: [{ fullName: { contains: s, mode: "insensitive" } }, { mobile: { contains: s } }, { username: { contains: s, mode: "insensitive" } }] } : {},
    orderBy: { createdAt: "desc" }, take: 200,
    include: { bookings: { where: { status: { in: ["no_show", "confirmed", "completed"] } }, select: { status: true } } },
  });
  res.json({
    users: users.map((u) => ({
      ...publicUser(u), isActive: u.isActive, lockedUntil: u.lockedUntil, createdAt: u.createdAt,
      noShows: u.bookings.filter((b) => b.status === "no_show").length, bookingCount: u.bookings.length,
    })),
  });
}));

adminRouter.get("/users/:id", wrap(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: idParam(req.params.id) } });
  if (!u) throw new HttpError(404, "User not found");
  const bookings = await prisma.booking.findMany({ where: { userId: u.id, status: { not: "held" } }, include: { resource: true }, orderBy: [{ slotDate: "desc" }, { startTime: "desc" }], take: 100 });
  res.json({ user: { ...publicUser(u), isActive: u.isActive, lockedUntil: u.lockedUntil, createdAt: u.createdAt, noShows: bookings.filter((b) => b.status === "no_show").length }, bookings: bookings.map(shape) });
}));

async function guardTarget(req: any, id: number) {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw new HttpError(404, "User not found");
  if (u.role === "super_admin" && req.user.role !== "super_admin") throw new HttpError(403, "Only the owner can change the owner");
  if (u.role === "admin" && req.user.role !== "super_admin" && u.id !== req.user.id) throw new HttpError(403, "Only the owner can change admins");
  return u;
}

adminRouter.patch("/users/:id", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({
    fullName: z.string().trim().min(2).max(80).optional(), email: z.string().email().nullable().optional(),
    username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/).nullable().optional(),
    playingRole: z.enum(["batsman", "bowler", "all-rounder", "keeper"]).nullable().optional(),
    skillLevel: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(), isActive: z.boolean().optional(),
  }).parse(req.body);
  const target = await guardTarget(req, id);
  if (b.isActive === false && target.id === req.user!.id) throw new HttpError(400, "You cannot deactivate yourself");
  try { await prisma.user.update({ where: { id }, data: b }); }
  catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, "Username already taken"); throw e; }
  await audit(_adminId(req), "user.update", "user", id, b);
  res.json({ ok: true });
}));

adminRouter.post("/users/:id/reset-pin", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  await guardTarget(req, id);
  const pin = tempPin();
  await prisma.user.update({ where: { id }, data: { pinHash: await bcrypt.hash(pin, 10), mustChangePin: true, failedAttempts: 0, lockedUntil: null } });
  await audit(_adminId(req), "user.reset_pin", "user", id);
  res.json({ tempPin: pin });
}));

adminRouter.post("/users/:id/unlock", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  await guardTarget(req, id);
  await prisma.user.update({ where: { id }, data: { failedAttempts: 0, lockedUntil: null } });
  await audit(_adminId(req), "user.unlock", "user", id);
  res.json({ ok: true });
}));

adminRouter.post("/users/:id/role", requireSuper, wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({ role: z.enum(["user", "admin"]) }).parse(req.body);
  const target = await guardTarget(req, id);
  if (target.role === "super_admin") throw new HttpError(400, "The owner's role cannot change");
  // Admins need a 6-digit PIN, so promotion issues a temporary one.
  const pin = b.role === "admin" ? tempPin() : undefined;
  await prisma.user.update({ where: { id }, data: { role: b.role, ...(pin ? { pinHash: await bcrypt.hash(pin, 10), mustChangePin: true } : {}) } });
  await audit(_adminId(req), "user.role", "user", id, b);
  res.json({ ok: true, tempPin: pin });
}));

// ---------- Resources, hours, pricing ----------
adminRouter.get("/resources", wrap(async (_req, res) => {
  res.json({ resources: await prisma.resource.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }) });
}));
const resourceBody = z.object({
  name: z.string().trim().min(1).max(40), type: z.enum(["net", "bowling_machine"]), description: z.string().max(200).nullable().optional(),
  surface: z.enum(["turf", "mat", "astro"]).nullable().optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().optional(),
});
adminRouter.post("/resources", wrap(async (req, res) => {
  const r = await prisma.resource.create({ data: resourceBody.parse(req.body) });
  await audit(_adminId(req), "resource.create", "resource", r.id);
  res.status(201).json({ resource: r });
}));
adminRouter.patch("/resources/:id", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const r = await prisma.resource.update({ where: { id }, data: resourceBody.partial().parse(req.body) });
  await audit(_adminId(req), "resource.update", "resource", id, req.body);
  res.json({ resource: r });
}));
adminRouter.delete("/resources/:id", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const used = await prisma.booking.count({ where: { resourceId: id } });
  if (used) { await prisma.resource.update({ where: { id }, data: { isActive: false } }); }
  else await prisma.resource.delete({ where: { id } });
  await audit(_adminId(req), "resource.delete", "resource", id, { softDeleted: used > 0 });
  res.json({ ok: true, disabledInstead: used > 0 });
}));

adminRouter.get("/hours", wrap(async (_req, res) => {
  res.json({ hours: await prisma.operatingHour.findMany({ orderBy: [{ resourceId: "asc" }, { dayOfWeek: "asc" }, { openTime: "asc" }] }) });
}));
/** Replaces the hours for one scope (a resource, or null = all resources). */
adminRouter.put("/hours", wrap(async (req, res) => {
  const b = z.object({
    resourceId: z.number().int().nullable(),
    rows: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), openTime: time, closeTime: time, slotMinutes: z.union([z.literal(30), z.literal(60)]) })).max(40),
  }).parse(req.body);
  for (const r of b.rows) if (toMin(r.closeTime) <= toMin(r.openTime)) throw new HttpError(400, "Closing time must be after opening time");
  await prisma.$transaction([
    prisma.operatingHour.deleteMany({ where: { resourceId: b.resourceId } }),
    prisma.operatingHour.createMany({ data: b.rows.map((r) => ({ ...r, resourceId: b.resourceId })) }),
  ]);
  await audit(_adminId(req), "hours.update", "operating_hours", b.resourceId ?? "all");
  res.json({ ok: true });
}));

adminRouter.get("/pricing", wrap(async (_req, res) => {
  res.json({ rules: await prisma.pricingRule.findMany({ orderBy: [{ resourceType: "asc" }, { dayType: "asc" }, { startTime: "asc" }] }) });
}));
adminRouter.put("/pricing", wrap(async (req, res) => {
  const b = z.object({
    rules: z.array(z.object({ resourceType: z.enum(["net", "bowling_machine"]), dayType: z.enum(["weekday", "weekend"]), startTime: time, endTime: time, priceInr: z.number().int().min(0).max(100000) })).max(60),
  }).parse(req.body);
  await prisma.$transaction([prisma.pricingRule.deleteMany(), prisma.pricingRule.createMany({ data: b.rules })]);
  await audit(_adminId(req), "pricing.update", "pricing_rules", undefined, { count: b.rules.length });
  res.json({ ok: true });
}));

// ---------- Venue, settings, photos ----------
adminRouter.get("/venue", wrap(async (_req, res) => { res.json({ settings: await getSettings() }); }));
adminRouter.patch("/venue", wrap(async (req, res) => {
  const b = z.object({
    venueName: z.string().max(80), address: z.string().max(300), mapEmbedUrl: z.string().max(1000).refine((v) => !v || /^https:\/\/(www\.)?google\.[a-z.]+\/maps/.test(v) || /^https:\/\/maps\.google\.[a-z.]+\//.test(v), "Use a Google Maps embed URL"),
    mapLink: z.string().max(500), lat: z.number().nullable(), lng: z.number().nullable(),
    contactPhone: z.string().max(20), whatsapp: z.string().max(20), upiId: z.string().max(80), upiPayeeName: z.string().max(80),
    cancellationHours: z.number().int().min(0).max(168), maxAdvanceDays: z.number().int().min(1).max(90), maxBookingsPerDay: z.number().int().min(1).max(10),
  }).partial().parse(req.body);
  await getSettings();
  const s = await prisma.venueSettings.update({ where: { id: 1 }, data: b });
  await audit(_adminId(req), "venue.update", "venue_settings", 1, b);
  res.json({ settings: s });
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });
const okMime = ["image/jpeg", "image/png", "image/webp"];

adminRouter.post("/photos", upload.single("file"), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, "No file");
  if (!okMime.includes(req.file.mimetype)) throw new HttpError(400, "Only JPG, PNG or WebP images");
  const count = await prisma.venuePhoto.count();
  const p = await prisma.venuePhoto.create({
    data: { imageData: new Uint8Array(req.file.buffer), mime: req.file.mimetype, caption: String(req.body.caption ?? "").slice(0, 120) || null, sortOrder: count, isCover: count === 0 },
    select: { id: true },
  });
  await audit(_adminId(req), "photo.create", "venue_photo", p.id);
  res.status(201).json({ id: p.id });
}));
adminRouter.patch("/photos/order", wrap(async (req, res) => {
  const b = z.object({ ids: z.array(z.number().int()) }).parse(req.body);
  await prisma.$transaction(b.ids.map((id, i) => prisma.venuePhoto.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
}));
adminRouter.patch("/photos/:id", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({ caption: z.string().max(120).nullable().optional(), isCover: z.boolean().optional() }).parse(req.body);
  if (b.isCover) await prisma.venuePhoto.updateMany({ data: { isCover: false } });
  await prisma.venuePhoto.update({ where: { id }, data: b });
  res.json({ ok: true });
}));
adminRouter.delete("/photos/:id", wrap(async (req, res) => {
  const id = idParam(req.params.id);
  await prisma.venuePhoto.delete({ where: { id } });
  await audit(_adminId(req), "photo.delete", "venue_photo", id);
  res.json({ ok: true });
}));

// ---------- Reports and audit ----------
adminRouter.get("/reports/collections", wrap(async (req, res) => {
  const { date: today } = istNow();
  const from = isDateStr(req.query.from) ? req.query.from : `${today.slice(0, 8)}01`;
  const to = isDateStr(req.query.to) ? req.query.to : today;
  const rows = await prisma.booking.findMany({
    where: { slotDate: { gte: dateOnly(from), lte: dateOnly(to) }, status: { in: ["confirmed", "completed", "no_show"] } },
    include: { resource: true, user: true }, orderBy: [{ slotDate: "asc" }, { startTime: "asc" }],
  });
  const byDay = new Map<string, { date: string; upi: number; cash: number; pending: number }>();
  for (const b of rows) {
    const d = dateStr(b.slotDate);
    const e = byDay.get(d) ?? { date: d, upi: 0, cash: 0, pending: 0 };
    if (b.paymentStatus === "paid") (b.paidVia === "cash" ? (e.cash += b.amountInr) : (e.upi += b.amountInr));
    else if (b.paymentStatus !== "refunded" && b.paymentStatus !== "rejected") e.pending += b.amountInr;
    byDay.set(d, e);
  }
  const days = [...byDay.values()];
  const totals = days.reduce((a, d) => ({ upi: a.upi + d.upi, cash: a.cash + d.cash, pending: a.pending + d.pending }), { upi: 0, cash: 0, pending: 0 });
  if (req.query.format === "csv") {
    res.set({ "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="collections_${from}_${to}.csv"` });
    return void res.send(csv([["Date", "UPI", "Cash", "Pending"], ...days.map((d) => [d.date, d.upi, d.cash, d.pending]), ["Total", totals.upi, totals.cash, totals.pending]]));
  }
  res.json({ from, to, days, totals });
}));

adminRouter.get("/audit", wrap(async (req, res) => {
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(Number(req.query.limit ?? 200), 1000) });
  const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter((x): x is number => x != null))] } }, select: { id: true, fullName: true } });
  res.json({ logs: rows.map((r) => ({ ...r, actor: actors.find((a) => a.id === r.actorId)?.fullName ?? null })) });
}));
