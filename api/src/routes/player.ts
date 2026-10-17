import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { isAdminRole, loadUser, requireAuth, requirePinChanged } from "../auth.js";
import { HttpError, wrap } from "../http.js";
import { buildGrid } from "../services/slots.js";
import { canPlayerCancel, confirmHolds, getSettings, holdSlots, shape } from "../services/bookings.js";
import { isDateStr, istNow } from "../time.js";

export const playerRouter = Router();
playerRouter.use(loadUser);

const photoJson = (p: { id: number; caption: string | null; isCover: boolean; sortOrder: number }) => ({
  id: p.id, caption: p.caption, isCover: p.isCover, sortOrder: p.sortOrder, url: `/api/photos/${p.id}/image`,
});

export async function venuePayload(includeUpi = true) {
  const s = await getSettings();
  const photos = await prisma.venuePhoto.findMany({ select: { id: true, caption: true, isCover: true, sortOrder: true }, orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { id: "asc" }] });
  return {
    venue: {
      name: s.venueName, address: s.address, mapEmbedUrl: s.mapEmbedUrl, mapLink: s.mapLink, lat: s.lat, lng: s.lng,
      contactPhone: s.contactPhone, whatsapp: s.whatsapp,
      ...(includeUpi ? { upiId: s.upiId, upiPayeeName: s.upiPayeeName } : {}),
      cancellationHours: s.cancellationHours, maxAdvanceDays: s.maxAdvanceDays, maxBookingsPerDay: s.maxBookingsPerDay,
    },
    photos: photos.map(photoJson),
    hours: await prisma.operatingHour.findMany({ where: { resourceId: null }, orderBy: { dayOfWeek: "asc" } }),
  };
}

playerRouter.get("/venue", wrap(async (req, res) => { res.json(await venuePayload(!!req.user)); }));

playerRouter.get("/photos/:id/image", wrap(async (req, res) => {
  const p = await prisma.venuePhoto.findUnique({ where: { id: Number(req.params.id) } });
  if (!p) throw new HttpError(404, "Not found");
  res.set({ "Content-Type": p.mime, "Cache-Control": "public, max-age=604800, immutable", "Cross-Origin-Resource-Policy": "cross-origin" });
  res.send(Buffer.from(p.imageData));
}));

playerRouter.get("/slots", requireAuth, requirePinChanged, wrap(async (req, res) => {
  const date = isDateStr(req.query.date) ? req.query.date : istNow().date;
  const type = req.query.type === "net" || req.query.type === "bowling_machine" ? req.query.type : undefined;
  res.json(await buildGrid(date, type, { id: req.user!.id, admin: isAdminRole(req.user!.role) }));
}));

const slotSchema = z.object({ resourceId: z.number().int(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: z.string().regex(/^\d{2}:\d{2}$/) });

playerRouter.post("/bookings/hold", requireAuth, requirePinChanged, wrap(async (req, res) => {
  const b = z.object({ slots: z.array(slotSchema).min(1).max(10) }).parse(req.body);
  const holds = await holdSlots(req.user!.id, b.slots);
  res.status(201).json({ holds: holds.map(shape), expiresAt: holds[0].holdExpiresAt });
}));

playerRouter.delete("/bookings/hold/:id", requireAuth, wrap(async (req, res) => {
  await prisma.booking.deleteMany({ where: { id: Number(req.params.id), userId: req.user!.id, status: "held" } });
  res.json({ ok: true });
}));

playerRouter.post("/bookings/confirm", requireAuth, requirePinChanged, wrap(async (req, res) => {
  const b = z.object({
    holdIds: z.array(z.number().int()).min(1), paymentMode: z.enum(["upi", "at_nets"]), upiRef: z.string().trim().optional(),
  }).parse(req.body);
  res.json({ bookings: await confirmHolds(req.user!.id, b.holdIds, b.paymentMode, b.upiRef) });
}));

/** Player submits (or corrects) the UTR after paying. */
playerRouter.post("/bookings/:id/utr", requireAuth, wrap(async (req, res) => {
  const b = z.object({ upiRef: z.string().regex(/^\d{12}$/, "UTR is 12 digits") }).parse(req.body);
  const bk = await prisma.booking.findFirst({ where: { id: Number(req.params.id), userId: req.user!.id, status: "confirmed" } });
  if (!bk || bk.paymentStatus === "paid") throw new HttpError(400, "Cannot update payment for this booking");
  await prisma.booking.update({ where: { id: bk.id }, data: { upiRef: b.upiRef, paymentMode: "upi", paymentStatus: "verification", paidVia: "upi" } });
  res.json({ ok: true });
}));

playerRouter.get("/bookings/me", requireAuth, wrap(async (req, res) => {
  const tab = String(req.query.tab ?? "upcoming");
  const { date, minutes } = istNow();
  const base = { userId: req.user!.id, status: { not: "held" } } as const;
  const rows = await prisma.booking.findMany({
    where: base, include: { resource: true }, orderBy: [{ slotDate: "desc" }, { startTime: "desc" }], take: 300,
  });
  const settings = await getSettings();
  const nowKey = `${date} ${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const list = rows.filter((b) => {
    const key = `${b.slotDate.toISOString().slice(0, 10)} ${b.endTime}`;
    if (tab === "cancelled") return b.status === "cancelled";
    if (b.status === "cancelled") return false;
    return tab === "upcoming" ? key > nowKey : key <= nowKey;
  });
  if (tab === "upcoming") list.reverse();
  res.json({ bookings: list.map((b) => ({ ...shape(b), canCancel: b.status === "confirmed" && canPlayerCancel(b, settings.cancellationHours) })) });
}));

playerRouter.post("/bookings/:id/cancel", requireAuth, wrap(async (req, res) => {
  const settings = await getSettings();
  const b = await prisma.booking.findFirst({ where: { id: Number(req.params.id), userId: req.user!.id } });
  if (!b || b.status !== "confirmed") throw new HttpError(400, "This booking cannot be cancelled");
  if (!canPlayerCancel(b, settings.cancellationHours))
    throw new HttpError(400, `Free cancellation ends ${settings.cancellationHours} hours before the slot. Please contact the nets.`);
  await prisma.booking.update({ where: { id: b.id }, data: { status: "cancelled" } });
  res.json({ ok: true, refundDue: b.paymentStatus === "paid" || b.paymentStatus === "verification" });
}));

