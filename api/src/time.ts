// All booking dates/times are wall-clock IST (Asia/Kolkata, UTC+5:30, no DST).
const IST_OFFSET_MIN = 330;

export function istNow(now = new Date()) {
  const d = new Date(now.getTime() + IST_OFFSET_MIN * 60000);
  const date = d.toISOString().slice(0, 10);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return { date, minutes };
}
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const dateOnly = (s: string) => new Date(`${s}T00:00:00.000Z`); // for @db.Date columns
export const dateStr = (d: Date) => d.toISOString().slice(0, 10);
export function addDays(s: string, n: number) {
  const d = dateOnly(s);
  d.setUTCDate(d.getUTCDate() + n);
  return dateStr(d);
}
export function dayOfWeek(s: string) { return dateOnly(s).getUTCDay(); }
export function dayType(s: string) { const w = dayOfWeek(s); return w === 0 || w === 6 ? "weekend" : "weekday"; }
/** The real instant a slot starts, for cancellation-window maths. */
export function slotInstant(date: string, start: string) {
  return new Date(`${date}T${start}:00+05:30`);
}
export function isPast(date: string, start: string, now = new Date()) {
  return slotInstant(date, start).getTime() <= now.getTime();
}
export const isDateStr = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
