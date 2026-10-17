import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { del, patch, post, put } from "../lib/api";
import { useApi } from "../lib/utils";
import { Badge, Skeleton } from "../components/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Setup() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold">Resources &amp; Pricing</h1>
      <Resources /><Hours /><Pricing />
    </div>
  );
}

function Resources() {
  const { data, loading, reload } = useApi<{ resources: any[] }>("/admin/resources");
  const [name, setName] = useState("");
  const [type, setType] = useState("net");
  const run = async (fn: () => Promise<any>, msg: string) => { try { const r = await fn(); toast.success(r?.disabledInstead ? "Has bookings, so it was disabled instead" : msg); reload(); } catch (e: any) { toast.error(e.message); } };
  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="font-heading font-semibold">Nets &amp; bowling machines</h2>
      {loading ? <Skeleton className="h-24" /> : data?.resources.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-black/5 pb-2">
          <input className="input !w-44 !py-2" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && run(() => patch(`/admin/resources/${r.id}`, { name: e.target.value.trim() }), "Renamed")} aria-label="Name" />
          <Badge tone={r.type === "net" ? "green" : "blue"}>{r.type === "net" ? "Net" : "Machine"}</Badge>
          <select className="input !w-28 !py-2" value={r.surface ?? ""} aria-label="Surface" onChange={(e) => run(() => patch(`/admin/resources/${r.id}`, { surface: e.target.value || null }), "Saved")}>
            <option value="">Surface</option><option>turf</option><option>mat</option><option>astro</option></select>
          <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={r.isActive} onChange={(e) => run(() => patch(`/admin/resources/${r.id}`, { isActive: e.target.checked }), e.target.checked ? "Enabled" : "Disabled")} />Active</label>
          <button aria-label="Delete" className="p-2 text-ball" onClick={() => confirm(`Delete ${r.name}?`) && run(() => del(`/admin/resources/${r.id}`), "Deleted")}><Trash2 size={18} /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <input className="input" placeholder="New name, e.g. Net 3" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input !w-40" value={type} onChange={(e) => setType(e.target.value)}><option value="net">Net</option><option value="bowling_machine">Machine</option></select>
        <button className="btn-primary" disabled={!name.trim()} onClick={() => run(() => post("/admin/resources", { name: name.trim(), type }).then(() => setName("")), "Added")}><Plus size={18} /></button>
      </div>
    </section>
  );
}

type HourRow = { dayOfWeek: number; openTime: string; closeTime: string; open: boolean };
function Hours() {
  const { data, loading } = useApi<{ hours: any[] }>("/admin/hours");
  const [rows, setRows] = useState<HourRow[]>([]);
  const [slot, setSlot] = useState(60);
  useEffect(() => {
    if (!data) return;
    const g = data.hours.filter((h) => h.resourceId === null);
    setSlot(g[0]?.slotMinutes ?? 60);
    setRows(Array.from({ length: 7 }, (_, d) => { const h = g.find((x) => x.dayOfWeek === d); return { dayOfWeek: d, openTime: h?.openTime ?? "06:00", closeTime: h?.closeTime ?? "22:00", open: !!h }; }));
  }, [data]);
  const save = async () => {
    try {
      await put("/admin/hours", { resourceId: null, rows: rows.filter((r) => r.open).map((r) => ({ dayOfWeek: r.dayOfWeek, openTime: r.openTime, closeTime: r.closeTime, slotMinutes: slot })) });
      toast.success("Opening hours saved");
    } catch (e: any) { toast.error(e.message); }
  };
  const set = (i: number, p: Partial<HourRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between"><h2 className="font-heading font-semibold">Opening hours</h2>
        <select className="input !w-36 !py-2" value={slot} aria-label="Slot length" onChange={(e) => setSlot(Number(e.target.value))}><option value={60}>60 min slots</option><option value={30}>30 min slots</option></select></div>
      {loading ? <Skeleton className="h-40" /> : rows.map((r, i) => (
        <div key={r.dayOfWeek} className="flex items-center gap-2 text-sm">
          <label className="flex w-28 items-center gap-2"><input type="checkbox" checked={r.open} onChange={(e) => set(i, { open: e.target.checked })} />{DAYS[i].slice(0, 3)}</label>
          {r.open ? (<><input type="time" className="input !w-auto !py-1.5" value={r.openTime} onChange={(e) => set(i, { openTime: e.target.value })} />–<input type="time" className="input !w-auto !py-1.5" value={r.closeTime} onChange={(e) => set(i, { closeTime: e.target.value })} /></>) : <span className="text-slate-500">Closed</span>}
        </div>
      ))}
      <button className="btn-primary" onClick={save}>Save hours</button>
    </section>
  );
}

function Pricing() {
  const { data, loading } = useApi<{ rules: any[] }>("/admin/pricing");
  const [rules, setRules] = useState<any[]>([]);
  useEffect(() => { if (data) setRules(data.rules); }, [data]);
  const set = (i: number, p: any) => setRules((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    try {
      await put("/admin/pricing", { rules: rules.map(({ resourceType, dayType, startTime, endTime, priceInr }) => ({ resourceType, dayType, startTime, endTime, priceInr: Number(priceInr) })) });
      toast.success("Prices saved");
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="font-heading font-semibold">Price rules</h2>
      <p className="text-xs text-slate-500">A slot costs the price of the rule whose time range contains its start time. Slots matching no rule cost ₹0.</p>
      {loading ? <Skeleton className="h-32" /> : rules.map((r, i) => (
        <div key={i} className="grid grid-cols-2 items-center gap-2 border-b border-black/5 pb-2 sm:grid-cols-6">
          <select className="input !py-2" value={r.resourceType} onChange={(e) => set(i, { resourceType: e.target.value })} aria-label="Type"><option value="net">Net</option><option value="bowling_machine">Machine</option></select>
          <select className="input !py-2" value={r.dayType} onChange={(e) => set(i, { dayType: e.target.value })} aria-label="Day type"><option value="weekday">Weekday</option><option value="weekend">Weekend</option></select>
          <input type="time" className="input !py-2" value={r.startTime} onChange={(e) => set(i, { startTime: e.target.value })} aria-label="From" />
          <input type="time" className="input !py-2" value={r.endTime} onChange={(e) => set(i, { endTime: e.target.value })} aria-label="To" />
          <input type="number" min={0} className="input !py-2" value={r.priceInr} onChange={(e) => set(i, { priceInr: e.target.value })} aria-label="Price ₹" />
          <button aria-label="Remove rule" className="justify-self-end p-2 text-ball" onClick={() => setRules((x) => x.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={() => setRules((r) => [...r, { resourceType: "net", dayType: "weekday", startTime: "06:00", endTime: "22:00", priceInr: 500 }])}><Plus size={18} />Add rule</button>
        <button className="btn-primary flex-1" onClick={save}>Save prices</button>
      </div>
    </section>
  );
}

