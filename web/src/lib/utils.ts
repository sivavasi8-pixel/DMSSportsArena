import clsx, { type ClassValue } from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, get } from "./api";

export const cn = (...v: ClassValue[]) => clsx(v);
export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Today's date in IST as YYYY-MM-DD, regardless of the device's timezone. */
export function todayIST() {
  return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
}
export function addDays(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
export function fmtTime(t: string) {
  const h = Number(t.slice(0, 2)), m = t.slice(3, 5);
  return `${h % 12 || 12}${m === "00" ? "" : ":" + m} ${h < 12 ? "AM" : "PM"}`;
}
export const fmtRange = (s: string, e: string) => `${fmtTime(s)} – ${fmtTime(e)}`;
export function fmtDate(d: string, long = false) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: long ? "long" : "short", day: "numeric", month: "short", timeZone: "UTC" });
}
export function slotStartMs(date: string, start: string) {
  return new Date(`${date}T${start}:00+05:30`).getTime();
}
export const rupeesLabel = inr;

export function useApi<T>(path: string | null, opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const reqId = useRef(0);

  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    const id = ++reqId.current;
    if (!quiet) setLoading(true);
    try {
      const d = await get<T>(path);
      if (alive.current && id === reqId.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current && id === reqId.current) setError(e as ApiError);
    } finally {
      if (alive.current && id === reqId.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => { alive.current = true; setData(null); load(); return () => { alive.current = false; }; }, [load]);
  useEffect(() => {
    if (!opts.poll) return;
    const t = setInterval(() => { if (!document.hidden) load(true); }, opts.poll);
    return () => clearInterval(t);
  }, [opts.poll, load]);

  return { data, error, loading, reload: () => load(true), setData };
}

export function haptic(ms = 12) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }

export function waLink(phone: string, text: string) {
  const p = phone.replace(/\D/g, "");
  return `https://wa.me/${p.length === 10 ? "91" + p : p}?text=${encodeURIComponent(text)}`;
}

export function gcalLink(title: string, date: string, start: string, end: string, location: string) {
  const f = (t: string) => `${date.replaceAll("-", "")}T${t.replace(":", "")}00`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${f(start)}/${f(end)}`, ctz: "Asia/Kolkata", location });
  return `https://calendar.google.com/calendar/render?${q}`;
}
