import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { HttpError } from "../http.js";
import { addDays, dateOnly, istNow, slotInstant } from "../time.js";
import { loadDay } from "./slots.js";

export type SlotReq = { resourceId: number; date: string; start: string };

const ACTIVE = ["held", "confirmed", "completed", "no_show"];

export async function getSettings() {
  return prisma.venueSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

function newCode(date: string) {
  const ymd = date.slice(2).replaceAll("-", "");
  const rnd = Math.floor(Math.random() * 36 ** 4).toString(36).toUpperCase().padStart(4, "0");
  return `DMS-${ymd}-${rnd}`;
}

export async function releaseExpiredHolds() {
  const r = await prisma.booking.deleteMany({ where: { status: "held", holdExpiresAt: { lte: new Date() } } });
  return r.count;
}

/**
 * Validates and atomically holds every requested slot for `userId`. All succeed or none do:
 * the unique partial index decides the winner when two people race for the same slot.
 */
export async function holdSlots(userId: number, slots: SlotReq[], opts: { byAdmin?: boolean; createdBy?: number } = {}) {
  if (!slots.length) throw new HttpError(400, "Pick at least one slot");
  const settings = await getSettings();
  const keys = new Set(slots.map((s) => `${s.resourceId}|${s.date}|${s.start}`));
  if (keys.size !== slots.length) throw new HttpError(400, "Duplicate slots in request");

  const today = istNow().date;
  const byDate = new Map<string, SlotReq[]>();
  for (const s of slots) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  const prepared: { s: SlotReq; end: string; price: number }[] = [];
  const invalid: SlotReq[] = [];
  for (const [date, list] of byDate) {
    if (!opts.byAdmin && (date < today || date > addDays(today, settings.maxAdvanceDays)))
      throw new HttpError(400, `You can book up to ${settings.maxAdvanceDays} days ahead`);
    const day = await loadDay(date);
    for (const s of list) {
      const res = day.resources.find((r) => r.id === s.resourceId);
      const slot = res && day.slotsFor(res).find((x) => x.start === s.start);
      if (!res || !slot || day.isPastSlot(s.start) || day.blockFor(res.id, slot)) { invalid.push(s); continue; }
      prepared.push({ s, end: slot.end, price: slot.price });
    }
  }
  if (invalid.length) throw new HttpError(409, "Some slots are no longer available", { clashes: invalid });

  if (!opts.byAdmin) {
    for (const [date, list] of byDate) {
      const existing = await prisma.booking.count({
        where: { userId, slotDate: dateOnly(date), OR: [{ status: "confirmed" }, { status: "held", holdExpiresAt: { gt: new Date() } }] },
      });
      if (existing + list.length > settings.maxBookingsPerDay)
        throw new HttpError(400, `You can book at most ${settings.maxBookingsPerDay} slots per day`);
    }
  }

  const expires = new Date(Date.now() + config.holdMinutes * 60000);
  const where = prepared.map((p) => ({ resourceId: p.s.resourceId, slotDate: dateOnly(p.s.date), startTime: p.s.start }));
  try {
    return await prisma.$transaction(async (tx) => {
      // Clear expired holds on exactly these slots so they cannot trip the unique index.
      await tx.booking.deleteMany({ where: { status: "held", holdExpiresAt: { lte: new Date() }, OR: where } });
      const out = [];
      for (const p of prepared) {
        out.push(await tx.booking.create({
          data: {
            bookingCode: newCode(p.s.date), userId, resourceId: p.s.resourceId, slotDate: dateOnly(p.s.date),
            startTime: p.s.start, endTime: p.end, status: "held", holdExpiresAt: expires, amountInr: p.price,
            createdBy: opts.createdBy ?? userId,
          },
          include: { resource: true },
        }));
      }
      return out;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const taken = await prisma.booking.findMany({
        where: { status: { in: ACTIVE }, OR: where },
        select: { resourceId: true, slotDate: true, startTime: true },
      });
      throw new HttpError(409, "Someone just grabbed one of those slots", {
        clashes: taken.map((t) => ({ resourceId: t.resourceId, date: t.slotDate.toISOString().slice(0, 10), start: t.startTime })),
      });
    }
    throw e;
  }
}

export function shape(b: any) {
  return {
    id: b.id, code: b.bookingCode, date: b.slotDate.toISOString().slice(0, 10), start: b.startTime, end: b.endTime,
    status: b.status, amount: b.amountInr, paymentMode: b.paymentMode, paymentStatus: b.paymentStatus, paidVia: b.paidVia,
    upiRef: b.upiRef, holdExpiresAt: b.holdExpiresAt, notes: b.notes, createdAt: b.createdAt,
    resource: b.resource ? { id: b.resource.id, name: b.resource.name, type: b.resource.type } : undefined,
    user: b.user ? { id: b.user.id, fullName: b.user.fullName, mobile: b.user.mobile } : undefined,
  };
}

export async function confirmHolds(
  userId: number, holdIds: number[], paymentMode: "upi" | "at_nets", upiRef?: string, markPaid?: { via: "upi" | "cash" },
) {
  if (paymentMode === "upi" && !markPaid && !/^\d{12}$/.test(upiRef ?? "")) throw new HttpError(400, "Enter the 12-digit UPI transaction ID (UTR)");
  return prisma.$transaction(async (tx) => {
    const holds = await tx.booking.findMany({ where: { id: { in: holdIds }, userId }, include: { resource: true } });
    if (holds.length !== holdIds.length) throw new HttpError(404, "Booking hold not found");
    const now = new Date();
    for (const h of holds) {
      if (h.status !== "held" || !h.holdExpiresAt || h.holdExpiresAt <= now)
        throw new HttpError(410, "Your hold expired. Please pick the slots again.", { code: "HOLD_EXPIRED" });
    }
    const paymentStatus = markPaid ? "paid" : paymentMode === "upi" ? "verification" : "pending";
    await tx.booking.updateMany({
      where: { id: { in: holdIds } },
      data: {
        status: "confirmed", holdExpiresAt: null, paymentMode, paymentStatus,
        upiRef: paymentMode === "upi" ? upiRef ?? null : null,
        paidVia: markPaid ? markPaid.via : paymentMode === "upi" ? "upi" : null,
      },
    });
    const rows = await tx.booking.findMany({ where: { id: { in: holdIds } }, include: { resource: true }, orderBy: [{ slotDate: "asc" }, { startTime: "asc" }] });
    return rows.map(shape);
  });
}

export function canPlayerCancel(b: { slotDate: Date; startTime: string }, cancellationHours: number) {
  const start = slotInstant(b.slotDate.toISOString().slice(0, 10), b.startTime).getTime();
  return start - Date.now() >= cancellationHours * 3600_000;
}
