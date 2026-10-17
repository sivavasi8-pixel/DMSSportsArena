import { prisma } from "../db.js";
import { dateOnly, dayOfWeek, dayType, fromMin, isPast, toMin } from "../time.js";

export type Slot = { resourceId: number; start: string; end: string; price: number };

const ACTIVE = ["held", "confirmed", "completed", "no_show"];

/** Loads everything needed to answer questions about one date. */
export async function loadDay(date: string, type?: string) {
  const now = new Date();
  const dow = dayOfWeek(date);
  const resources = await prisma.resource.findMany({
    where: { isActive: true, ...(type ? { type } : {}) },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const ids = resources.map((r) => r.id);
  const [hours, rules, bookings, blocks] = await Promise.all([
    prisma.operatingHour.findMany({ where: { dayOfWeek: dow } }),
    prisma.pricingRule.findMany(),
    prisma.booking.findMany({
      where: { slotDate: dateOnly(date), resourceId: { in: ids }, status: { in: ACTIVE } },
      include: { user: { select: { id: true, fullName: true, mobile: true } } },
    }),
    prisma.slotBlock.findMany({ where: { blockDate: dateOnly(date), OR: [{ resourceId: null }, { resourceId: { in: ids } }] } }),
  ]);
  // An expired hold never blocks anyone, even if the cleanup job has not run yet.
  const live = bookings.filter((b) => !(b.status === "held" && b.holdExpiresAt && b.holdExpiresAt <= now));
  const dt = dayType(date);

  const priceFor = (rtype: string, start: string) => {
    const m = toMin(start);
    const rule = rules.find((r) => r.resourceType === rtype && r.dayType === dt && toMin(r.startTime) <= m && m < toMin(r.endTime));
    return rule?.priceInr ?? 0;
  };

  function slotsFor(resource: (typeof resources)[number]): Slot[] {
    const own = hours.filter((h) => h.resourceId === resource.id);
    const rows = own.length ? own : hours.filter((h) => h.resourceId === null);
    const out = new Map<string, Slot>();
    for (const h of rows) {
      const step = h.slotMinutes;
      for (let m = toMin(h.openTime); m + step <= toMin(h.closeTime); m += step) {
        out.set(fromMin(m), { resourceId: resource.id, start: fromMin(m), end: fromMin(m + step), price: priceFor(resource.type, fromMin(m)) });
      }
    }
    return [...out.values()].sort((a, b) => a.start.localeCompare(b.start));
  }
  const blockFor = (resourceId: number, s: Slot) =>
    blocks.find((b) => (b.resourceId === null || b.resourceId === resourceId) && toMin(b.startTime) < toMin(s.end) && toMin(b.endTime) > toMin(s.start));
  const bookingFor = (resourceId: number, start: string) => live.find((b) => b.resourceId === resourceId && b.startTime === start);

  return { now, resources, slotsFor, blockFor, bookingFor, isPastSlot: (start: string) => isPast(date, start, now) };
}

export type CellState = "available" | "selected_hold" | "held" | "booked" | "blocked" | "past";

export async function buildGrid(date: string, type: string | undefined, viewer: { id: number; admin: boolean }) {
  const day = await loadDay(date, type);
  const times = new Map<string, string>();
  const cells: Record<number, Record<string, any>> = {};
  for (const r of day.resources) {
    cells[r.id] = {};
    for (const s of day.slotsFor(r)) {
      times.set(s.start, s.end);
      const b = day.bookingFor(r.id, s.start);
      const blk = day.blockFor(r.id, s);
      let state: CellState = "available";
      if (day.isPastSlot(s.start)) state = "past";
      else if (blk) state = "blocked";
      else if (b) state = b.status === "held" ? (b.userId === viewer.id ? "selected_hold" : "held") : "booked";
      // A past slot that was booked still shows as booked so history is readable.
      if (state === "past" && b && b.status !== "held") state = "booked";
      const cell: any = { state, price: s.price, end: s.end };
      if (blk) { cell.reason = blk.reason ?? "Blocked"; if (viewer.admin) cell.blockId = blk.id; }
      if (b) {
        cell.mine = b.userId === viewer.id;
        if (viewer.admin) cell.booking = { id: b.id, code: b.bookingCode, status: b.status, paymentStatus: b.paymentStatus, paymentMode: b.paymentMode, user: b.user };
      }
      cells[r.id][s.start] = cell;
    }
  }
  return {
    date,
    resources: day.resources.map((r) => ({ id: r.id, name: r.name, type: r.type })),
    times: [...times.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([start, end]) => ({ start, end })),
    cells,
  };
}
