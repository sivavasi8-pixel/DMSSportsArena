import { useMemo, useState } from "react";
import { toast } from "sonner";
import { del, patch } from "../lib/api";
import { addDays, fmtDate, fmtRange, fmtTime, inr, todayIST, useApi } from "../lib/utils";
import { GridLegend, SlotGrid, slotKey, type Cell, type Grid } from "../components/SlotGrid";
import { ErrorBox, Sheet, Skeleton, payBadge, statusBadge } from "../components/ui";
import { BlockForm, WalkInForm } from "./forms";

export function BookingActions({ booking, onChanged, grid }: { booking: any; onChanged: () => void; grid?: Grid }) {
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [dest, setDest] = useState({ resourceId: 0, start: "" });
  const act = async (body: any, msg: string) => {
    setBusy(true);
    try { await patch(`/admin/bookings/${booking.id}`, body); toast.success(msg); onChanged(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const free = useMemo(() => {
    if (!grid) return [];
    const out: { resourceId: number; start: string; label: string }[] = [];
    for (const r of grid.resources) for (const t of grid.times) if (grid.cells[r.id]?.[t.start]?.state === "available") out.push({ resourceId: r.id, start: t.start, label: `${r.name} · ${fmtTime(t.start)}` });
    return out;
  }, [grid]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">{statusBadge(booking.status)}{payBadge(booking)}</div>
      <p className="text-sm">
        <b>{booking.user?.fullName}</b> · <a className="underline" href={`tel:${booking.user?.mobile}`}>{booking.user?.mobile}</a><br />
        {booking.resource?.name} · {fmtDate(booking.date, true)} · {fmtRange(booking.start, booking.end)}<br />
        Code {booking.code} · {inr(booking.amount)}{booking.upiRef && <> · UTR <b>{booking.upiRef}</b></>}
      </p>
      {booking.paymentStatus !== "paid" && booking.status === "confirmed" && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary !py-2.5 text-sm" disabled={busy} onClick={() => act({ paymentStatus: "paid", paidVia: "cash" }, "Marked paid (cash)")}>Paid (cash)</button>
          <button className="btn-primary !py-2.5 text-sm" disabled={busy} onClick={() => act({ paymentStatus: "paid", paidVia: "upi" }, "Marked paid (UPI)")}>Paid (UPI)</button>
          {booking.paymentStatus === "verification" && <button className="btn-danger col-span-2 !py-2.5 text-sm" disabled={busy} onClick={() => act({ paymentStatus: "rejected" }, "Payment rejected")}>Reject payment</button>}
        </div>
      )}
      {booking.status === "confirmed" && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost !py-2.5 text-sm" disabled={busy} onClick={() => act({ status: "completed" }, "Marked completed")}>Completed</button>
          <button className="btn-ghost !py-2.5 text-sm" disabled={busy} onClick={() => act({ status: "no_show" }, "Marked no-show")}>No-show</button>
          {grid && <button className="btn-ghost !py-2.5 text-sm" onClick={() => setMoving((m) => !m)}>Move…</button>}
          <button className="btn-danger !py-2.5 text-sm" disabled={busy} onClick={() => confirm("Cancel this booking?") && act({ status: "cancelled" }, "Booking cancelled")}>Cancel booking</button>
        </div>
      )}
      {booking.paymentStatus === "paid" && booking.status === "cancelled" && <button className="btn-ghost text-sm" onClick={() => act({ paymentStatus: "refunded" }, "Marked refunded")}>Mark refunded</button>}
      {moving && (
        <div className="flex gap-2">
          <select className="input" value={`${dest.resourceId}|${dest.start}`} onChange={(e) => { const [r, s] = e.target.value.split("|"); setDest({ resourceId: Number(r), start: s }); }}>
            <option value="0|">Choose free slot on {fmtDate(grid!.date)}</option>
            {free.map((f) => <option key={f.label} value={`${f.resourceId}|${f.start}`}>{f.label}</option>)}
          </select>
          <button className="btn-primary" disabled={!dest.start || busy} onClick={() => act({ move: { resourceId: dest.resourceId, date: grid!.date, start: dest.start } }, "Booking moved")}>Move</button>
        </div>
      )}
    </div>
  );
}

export default function Schedule() {
  const [date, setDate] = useState(todayIST());
  const { data: grid, error, loading, reload } = useApi<Grid>(`/slots?date=${date}`, { poll: 10000 });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<any>(null);
  const [mode, setMode] = useState<null | "book" | "block">(null);
  const [blockInfo, setBlockInfo] = useState<any>(null);

  const tap = (resourceId: number, start: string, cell: Cell | undefined) => {
    if (!cell) return;
    if (cell.state === "available" || cell.state === "past") {
      if (cell.state === "past") return;
      setPicked((p) => { const n = new Set(p); const k = slotKey(resourceId, start); n.has(k) ? n.delete(k) : n.add(k); return n; });
    } else if ((cell.state === "booked" || cell.state === "held") && cell.booking) {
      const r = grid!.resources.find((x) => x.id === resourceId)!;
      setDetail({ ...cell.booking, user: cell.booking.user, date, start, end: cell.end, resource: r, amount: cell.price, upiRef: null, paymentMode: cell.booking.paymentMode });
    } else if (cell.state === "blocked") setBlockInfo({ cell, resourceId, start });
  };

  const slots = [...picked].map((k) => {
    const [rid, start] = k.split("|");
    const r = grid!.resources.find((x) => x.id === Number(rid))!;
    return { resourceId: Number(rid), date, start, label: `${r.name} ${fmtTime(start)}` };
  });
  const clear = () => { setPicked(new Set()); setMode(null); reload(); };

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-bold">Live Schedule</h1>
        <div className="flex items-center gap-2">
          <button className="btn-ghost !px-3 !py-2" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <input type="date" className="input !w-auto !py-2" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button className="btn-ghost !px-3 !py-2" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
          <button className="btn-ghost !py-2" onClick={() => setDate(todayIST())}>Today</button>
        </div>
      </div>
      {loading && !grid ? <Skeleton className="h-96" /> : error ? <ErrorBox message={error.message} retry={reload} /> : grid && (
        <>
          <p className="text-sm text-slate-500">{fmtDate(date, true)} · Tap empty cells to select them, or tap a booking to manage it.</p>
          <SlotGrid grid={grid} admin selected={picked} onAdminTap={tap} />
          <GridLegend />
        </>
      )}
      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-30 lg:bottom-3 mx-auto flex max-w-md items-center justify-between gap-2 rounded-2xl bg-pitch p-3 text-white shadow-lg">
          <span className="pl-1 font-semibold">{picked.size} selected</span>
          <div className="flex gap-2">
            <button className="rounded-xl bg-white/15 px-3 py-2 text-sm" onClick={() => setPicked(new Set())}>Clear</button>
            <button className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-pitch" onClick={() => setMode("block")}>Block</button>
            <button className="rounded-xl bg-turf px-3 py-2 text-sm font-semibold text-pitch-900" onClick={() => setMode("book")}>Book</button>
          </div>
        </div>
      )}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title="Booking">
        {detail && <BookingActions booking={detail} grid={grid ?? undefined} onChanged={() => { setDetail(null); reload(); }} />}
      </Sheet>
      <Sheet open={mode === "book"} onClose={() => setMode(null)} title="Create booking">
        <WalkInForm slots={slots} onDone={clear} />
      </Sheet>
      <Sheet open={mode === "block" && !!grid} onClose={() => setMode(null)} title="Block slots">
        {grid && mode === "block" && slots.length > 0 && (() => {
          const rs = [...new Set(slots.map((s) => s.resourceId))];
          const starts = slots.map((s) => s.start).sort();
          const endOf = grid.cells[slots.sort((a, b) => b.start.localeCompare(a.start))[0].resourceId]?.[starts[starts.length - 1]]?.end;
          return <BlockForm resources={grid.resources} init={{ resourceIds: rs, date, start: starts[0], end: endOf }} onDone={clear} />;
        })()}
      </Sheet>
      <Sheet open={!!blockInfo} onClose={() => setBlockInfo(null)} title="Blocked slot">
        {blockInfo && (
          <div className="flex flex-col gap-3">
            <p>{blockInfo.cell.reason}</p>
            <button className="btn-danger" onClick={async () => { try { await del(`/admin/blocks/${blockInfo.cell.blockId}`); toast.success("Unblocked"); setBlockInfo(null); reload(); } catch (e: any) { toast.error(e.message); } }}>Unblock</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
