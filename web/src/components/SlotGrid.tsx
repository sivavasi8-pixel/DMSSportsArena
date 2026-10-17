import { Check } from "lucide-react";
import { cn, fmtTime, haptic, inr } from "../lib/utils";

export type Cell = {
  state: "available" | "selected_hold" | "held" | "booked" | "blocked" | "past"; price: number; end: string; reason?: string; blockId?: number; mine?: boolean;
  booking?: { id: number; code: string; status: string; paymentStatus: string; paymentMode: string | null; user: { id: number; fullName: string; mobile: string } };
};
export type Grid = { date: string; resources: { id: number; name: string; type: string }[]; times: { start: string; end: string }[]; cells: Record<number, Record<string, Cell>> };

export const slotKey = (resourceId: number, start: string) => `${resourceId}|${start}`;

export function SlotGrid({ grid, selected, onSelect, admin, onAdminTap, highlight }: {
  grid: Grid; selected?: Set<string>; onSelect?: (resourceId: number, start: string, cell: Cell) => void;
  admin?: boolean; onAdminTap?: (resourceId: number, start: string, cell: Cell | undefined) => void; highlight?: Set<string>;
}) {
  const cols = grid.resources.length;
  if (!cols || !grid.times.length) return null;
  return (
    <div className="overflow-x-auto rounded-card" role="grid" aria-label="Slot availability">
      <div className="grid min-w-fit gap-1.5" style={{ gridTemplateColumns: `64px repeat(${cols}, minmax(${admin ? 120 : 92}px, 1fr))` }}>
        <div />
        {grid.resources.map((r) => (
          <div key={r.id} className="sticky top-0 px-1 py-1 text-center text-xs font-semibold text-pitch dark:text-turf" role="columnheader">{r.name}</div>
        ))}
        {grid.times.map((t) => (
          <Row key={t.start} t={t} grid={grid} selected={selected} onSelect={onSelect} admin={admin} onAdminTap={onAdminTap} highlight={highlight} />
        ))}
      </div>
    </div>
  );
}

function Row({ t, grid, selected, onSelect, admin, onAdminTap, highlight }: any) {
  return (
    <>
      <div className="flex items-center justify-end pr-1 text-xs font-medium text-slate-500" role="rowheader">{fmtTime(t.start)}</div>
      {grid.resources.map((r: Grid["resources"][number]) => {
        const c: Cell | undefined = grid.cells[r.id]?.[t.start];
        if (!c) return <div key={r.id} className="min-h-[52px] rounded-xl bg-black/5 opacity-40" aria-hidden />;
        const sel = selected?.has(slotKey(r.id, t.start));
        const tappable = admin ? true : c.state === "available";
        const base = "relative flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-1 py-1 text-xs transition";
        let look = "";
        let content: React.ReactNode = null;
        if (sel) { look = "border-turf bg-turf text-white shadow-soft"; content = (<><Check size={16} /><span className="font-semibold">{inr(c.price)}</span></>); }
        else if (c.state === "available") { look = "border-turf text-pitch hover:bg-turf/10 dark:text-turf"; content = <span className="font-semibold">{inr(c.price)}</span>; }
        else if (c.state === "selected_hold") { look = "border-turf bg-turf/20 text-pitch"; content = <span className="font-semibold">Your hold</span>; }
        else if (c.state === "held") { look = "border-amber-400 bg-amber-100 text-amber-900"; content = <span className="font-medium">{admin && c.booking ? c.booking.user.fullName : "Being booked"}</span>; }
        else if (c.state === "booked") {
          look = "border-slate-300 bg-slate-200 text-slate-500 dark:bg-white/10 dark:border-white/10";
          content = admin && c.booking ? (
            <><span className="max-w-full truncate font-semibold text-slate-700 dark:text-slate-200">{c.booking.user.fullName}</span><span className="text-[10px]">{c.booking.user.mobile}</span></>
          ) : (<span className="line-through">{c.mine ? "Yours" : "Booked"}</span>);
        } else if (c.state === "blocked") { look = "hatched border-slate-300 text-slate-600"; content = <span className="px-1 text-center font-medium leading-tight">{c.reason}</span>; }
        else { look = "border-transparent bg-black/5 text-slate-400 opacity-60"; content = <span>{inr(c.price)}</span>; }
        const hl = highlight?.has(slotKey(r.id, t.start)) ? "ring-2 ring-ball" : "";
        return (
          <button
            key={r.id} role="gridcell" type="button" disabled={!tappable}
            aria-label={`${r.name} ${fmtTime(t.start)} ${c.state}`}
            aria-pressed={sel}
            className={cn(base, look, hl, tappable ? "cursor-pointer active:scale-95" : "cursor-default")}
            onClick={() => { haptic(); admin ? onAdminTap?.(r.id, t.start, c) : onSelect?.(r.id, t.start, c); }}
          >
            {content}
          </button>
        );
      })}
    </>
  );
}

export function GridLegend() {
  const item = (cls: string, label: string) => (<span className="inline-flex items-center gap-1.5"><span className={cn("h-3.5 w-3.5 rounded border", cls)} />{label}</span>);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {item("border-turf", "Available")}{item("border-turf bg-turf", "Selected")}{item("border-amber-400 bg-amber-100", "Being booked")}
      {item("border-slate-300 bg-slate-200", "Booked")}{item("hatched border-slate-300", "Blocked")}
    </div>
  );
}
