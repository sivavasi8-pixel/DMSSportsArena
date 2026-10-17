import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Banknote, Smartphone, Timer } from "lucide-react";
import { ApiError, del, post } from "../lib/api";
import { addDays, cn, fmtDate, fmtRange, fmtTime, inr, todayIST, useApi } from "../lib/utils";
import { Empty, ErrorBox, Sheet, Skeleton } from "../components/ui";
import { GridLegend, SlotGrid, slotKey, type Cell, type Grid } from "../components/SlotGrid";
import type { VenueData } from "./Venue";

type Sel = { resourceId: number; date: string; start: string; end: string; price: number; name: string; type: string };
const selId = (s: { resourceId: number; date: string; start: string }) => `${s.resourceId}|${s.date}|${s.start}`;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export default function Book() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const type = params.get("type") === "bowling_machine" ? "bowling_machine" : "net";
  const [date, setDate] = useState(todayIST());
  const [picked, setPicked] = useState<Map<string, Sel>>(new Map());
  const [checkout, setCheckout] = useState<{ holds: any[]; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [clash, setClash] = useState<Set<string>>(new Set());

  const venue = useApi<VenueData>("/venue");
  const { data: grid, error, loading, reload } = useApi<Grid>(checkout ? null : `/slots?date=${date}&type=${type}`, { poll: 10000 });
  const days = useMemo(() => Array.from({ length: (venue.data?.venue.maxAdvanceDays ?? 14) + 1 }, (_, i) => addDays(todayIST(), i)), [venue.data]);
  const maxPer = venue.data?.venue.maxBookingsPerDay ?? 3;

  // Drop selections that other players have taken since the last refresh.
  useEffect(() => {
    if (!grid) return;
    setPicked((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [k, s] of prev) {
        if (s.date !== grid.date || s.type !== type) continue;
        const c = grid.cells[s.resourceId]?.[s.start];
        if (!c || c.state !== "available") { next.delete(k); changed = true; toast.warning(`${s.name}, ${fmtTime(s.start)} was just taken`); }
      }
      return changed ? next : prev;
    });
  }, [grid, type]);

  const toggle = (resourceId: number, start: string, cell: Cell) => {
    if (!grid) return;
    const r = grid.resources.find((x) => x.id === resourceId)!;
    const s: Sel = { resourceId, date: grid.date, start, end: cell.end, price: cell.price, name: r.name, type: r.type };
    const id = selId(s);
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(id)) { next.delete(id); return next; }
      const sameDay = [...next.values()].filter((x) => x.date === s.date).length;
      if (sameDay >= maxPer) { toast.error(`You can book at most ${maxPer} slots per day`); return prev; }
      next.set(id, s);
      return next;
    });
  };

  const list = [...picked.values()].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const total = list.reduce((a, s) => a + s.price, 0);
  const selectedHere = new Set(list.filter((s) => s.date === grid?.date).map((s) => slotKey(s.resourceId, s.start)));

  const proceed = async () => {
    setBusy(true);
    try {
      const r = await post("/bookings/hold", { slots: list.map(({ resourceId, date, start }) => ({ resourceId, date, start })) });
      setCheckout({ holds: r.holds, expiresAt: r.expiresAt });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) {
        const clashes: { resourceId: number; date: string; start: string }[] = err.data.clashes ?? [];
        const first = clashes[0] && list.find((s) => selId(s) === selId(clashes[0]));
        toast.error(first ? `Someone just grabbed ${first.name}, ${fmtTime(first.start)}` : err.message);
        // keep their other selections, drop only the clashing ones
        setPicked((prev) => { const n = new Map(prev); clashes.forEach((c) => n.delete(selId(c))); return n; });
        setClash(new Set(clashes.map((c) => slotKey(c.resourceId, c.start))));
        setTimeout(() => setClash(new Set()), 4000);
        reload();
      } else toast.error(err.message);
    } finally { setBusy(false); }
  };

  const release = useCallback(async (holds: any[]) => { await Promise.all(holds.map((h) => del(`/bookings/hold/${h.id}`).catch(() => {}))); }, []);
  const closeCheckout = async () => { if (checkout) { const h = checkout.holds; setCheckout(null); await release(h); reload(); } };

  const onConfirmed = (bookings: any[]) => {
    setCheckout(null); setPicked(new Map());
    nav("/confirmation", { state: { bookings, venue: venue.data?.venue }, replace: true });
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      <h1 className="font-heading text-2xl font-bold">Book a slot</h1>

      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
        {([["net", "Nets"], ["bowling_machine", "Bowling Machine"]] as const).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={type === v} onClick={() => setParams({ type: v })} className={cn("rounded-lg py-2.5 text-sm font-semibold transition", type === v ? "bg-pitch text-white shadow-soft" : "text-slate-600 dark:text-slate-300")}>{l}</button>
        ))}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="listbox" aria-label="Choose date">
        {days.map((d) => {
          const [wd, dm] = fmtDate(d).split(", ");
          const on = d === date;
          return (
            <button key={d} role="option" aria-selected={on} onClick={() => setDate(d)} className={cn("flex min-w-[58px] flex-col items-center rounded-2xl border px-3 py-2 transition", on ? "border-pitch bg-pitch text-white" : "border-slate-200 bg-white dark:border-white/10 dark:bg-[#12201a]")}>
              <span className="text-[11px] uppercase opacity-80">{d === todayIST() ? "Today" : wd}</span>
              <span className="font-heading text-lg font-semibold leading-tight">{(dm ?? "").split(" ")[0]}</span>
              <span className="text-[10px] opacity-70">{(dm ?? "").split(" ")[1]}</span>
            </button>
          );
        })}
      </div>

      {loading && !grid ? <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        : error ? <ErrorBox message={error.message} retry={reload} />
        : grid && (grid.resources.length === 0 || grid.times.length === 0) ? <Empty title="Nothing to book on this day" hint="The nets are closed, or no lanes are set up for this day." />
        : grid && (
          <>
            <SlotGrid grid={grid} selected={selectedHere} onSelect={toggle} highlight={clash} />
            <GridLegend />
            <p className="text-xs text-slate-500">Updates automatically every 10 seconds. Select up to {maxPer} slots per day.</p>
          </>
        )}

      {list.length > 0 && !checkout && (
        <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed inset-x-0 bottom-[60px] z-30 mx-auto max-w-2xl px-3" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-pitch p-3 pl-4 text-white shadow-lg">
            <span className="font-semibold">{list.length} slot{list.length > 1 && "s"} · {inr(total)}</span>
            <div className="flex gap-2">
              <button className="rounded-xl bg-white/15 px-3 py-2 text-sm" onClick={() => setPicked(new Map())}>Clear</button>
              <button className="rounded-xl bg-turf px-4 py-2 font-semibold text-pitch-900 disabled:opacity-60" disabled={busy} onClick={proceed}>{busy ? "Holding…" : "Continue"}</button>
            </div>
          </div>
        </motion.div>
      )}

      {checkout && venue.data && <Checkout holds={checkout.holds} expiresAt={checkout.expiresAt} venue={venue.data.venue} onClose={closeCheckout} onDone={onConfirmed} onExpired={() => { setCheckout(null); setPicked(new Map()); toast.error("Your hold expired. Please pick again."); reload(); }} />}
    </div>
  );
}

function Checkout({ holds, expiresAt, venue, onClose, onDone, onExpired }: {
  holds: any[]; expiresAt: string; venue: VenueData["venue"]; onClose: () => void; onDone: (b: any[]) => void; onExpired: () => void;
}) {
  const [mode, setMode] = useState<"upi" | "at_nets">(venue.upiId ? "upi" : "at_nets");
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));
  const expired = useRef(false);
  const total = holds.reduce((a, h) => a + h.amount, 0);

  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setLeft(l);
      if (l === 0 && !expired.current) { expired.current = true; onExpired(); }
    }, 500);
    return () => clearInterval(t);
  }, [expiresAt, onExpired]);

  const upiLink = `upi://pay?pa=${encodeURIComponent(venue.upiId ?? "")}&pn=${encodeURIComponent(venue.upiPayeeName ?? "")}&am=${total}&cu=INR&tn=${encodeURIComponent(holds[0].code)}`;
  const mm = String(Math.floor(left / 60000)).padStart(2, "0"), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await post("/bookings/confirm", { holdIds: holds.map((h) => h.id), paymentMode: mode, upiRef: mode === "upi" ? utr : undefined });
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 140, spread: 80, origin: { y: 0.7 }, colors: ["#22C55E", "#0F5132", "#DC2626", "#FAF7F0"] });
      onDone(r.bookings);
    } catch (e: any) {
      toast.error(e.message);
      if (e.data?.code === "HOLD_EXPIRED") onExpired();
    } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title="Checkout">
      <div className={cn("mb-4 flex items-center justify-center gap-2 rounded-xl py-2 font-semibold", left < 60000 ? "bg-red-100 text-ball" : "bg-amber-100 text-amber-900")} role="timer">
        <Timer size={18} /> Slots held for {mm}:{ss}
      </div>
      <ul className="mb-4 divide-y divide-black/5 rounded-xl border border-black/5">
        {holds.map((h) => (
          <li key={h.id} className="flex justify-between p-3 text-sm">
            <span><b>{h.resource.name}</b><br />{fmtDate(h.date)} · {fmtRange(h.start, h.end)}</span><b>{inr(h.amount)}</b>
          </li>
        ))}
        <li className="flex justify-between p-3 font-bold"><span>Total</span><span>{inr(total)}</span></li>
      </ul>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {venue.upiId && <button onClick={() => setMode("upi")} className={cn("flex flex-col items-center gap-1 rounded-xl border-2 p-3 font-medium", mode === "upi" ? "border-pitch bg-pitch-50 text-pitch dark:bg-pitch/30 dark:text-white" : "border-slate-200")}><Smartphone />Pay by UPI</button>}
        <button onClick={() => setMode("at_nets")} className={cn("flex flex-col items-center gap-1 rounded-xl border-2 p-3 font-medium", mode === "at_nets" ? "border-pitch bg-pitch-50 text-pitch dark:bg-pitch/30 dark:text-white" : "border-slate-200", !venue.upiId && "col-span-2")}><Banknote />Pay at nets</button>
      </div>

      {mode === "upi" ? (
        <div className="mb-4 flex flex-col items-center gap-3">
          {isMobile ? (
            <a href={upiLink} className="btn-primary w-full">Pay {inr(total)} with UPI app</a>
          ) : (
            <div className="rounded-xl bg-white p-3"><QRCodeSVG value={upiLink} size={176} /></div>
          )}
          <p className="text-center text-xs text-slate-500">{isMobile ? "GPay, PhonePe or Paytm will open with the amount filled in." : "Scan with any UPI app."} Pay to <b>{venue.upiPayeeName}</b> ({venue.upiId}). Booking code <b>{holds[0].code}</b> is added as the note.</p>
          <div className="w-full">
            <label htmlFor="utr" className="label">After paying, enter the 12-digit UTR / transaction ID</label>
            <input id="utr" className="input tracking-widest" inputMode="numeric" maxLength={12} value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, ""))} placeholder="123456789012" />
          </div>
        </div>
      ) : (
        <p className="mb-4 rounded-xl bg-black/5 p-3 text-sm dark:bg-white/10">Your booking is confirmed now. Please pay <b>{inr(total)}</b> in cash or UPI when you reach the nets.</p>
      )}
      <button className="btn-primary w-full" disabled={busy || (mode === "upi" && utr.length !== 12)} onClick={confirm}>{busy ? "Confirming…" : mode === "upi" ? "I've paid — Confirm booking" : "Confirm booking"}</button>
    </Sheet>
  );
}
