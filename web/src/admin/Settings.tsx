import { useEffect, useState } from "react";
import { toast } from "sonner";
import { patch } from "../lib/api";
import { useApi } from "../lib/utils";
import { Field, Skeleton } from "../components/ui";

export default function Settings() {
  const { data } = useApi<{ settings: any }>("/admin/venue");
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (data) setF(data.settings); }, [data]);
  const audit = useApi<{ logs: any[] }>("/admin/audit?limit=200");
  const save = async () => {
    try {
      await patch("/admin/venue", { cancellationHours: Number(f.cancellationHours), maxAdvanceDays: Number(f.maxAdvanceDays), maxBookingsPerDay: Number(f.maxBookingsPerDay) });
      toast.success("Rules saved");
    } catch (e: any) { toast.error(e.message); }
  };
  const num = (k: string, label: string, hint: string) => (
    <Field label={label} hint={hint}><input type="number" min={0} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
  );
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold">Settings &amp; Audit log</h1>
      <section className="card grid gap-3 p-4 sm:grid-cols-3">
        {!f ? <Skeleton className="h-24 sm:col-span-3" /> : (<>
          {num("cancellationHours", "Free cancellation (hours before)", "Players can cancel until this long before the slot")}
          {num("maxAdvanceDays", "Book up to (days ahead)", "")}
          {num("maxBookingsPerDay", "Max slots per player per day", "")}
          <button className="btn-primary sm:col-span-3" onClick={save}>Save rules</button>
        </>)}
      </section>
      <section className="card p-4">
        <h2 className="mb-2 font-heading font-semibold">Admin activity</h2>
        {!audit.data ? <Skeleton className="h-40" /> : audit.data.logs.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500"><tr><th className="py-1">When</th><th>Who</th><th>Action</th><th>Target</th></tr></thead>
              <tbody>{audit.data.logs.map((l) => (
                <tr key={l.id} className="border-t border-black/5"><td className="py-1.5 pr-2 text-xs">{new Date(l.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td><td>{l.actor ?? "—"}</td><td className="font-mono text-xs">{l.action}</td><td className="text-xs">{l.entity} {l.entityId}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
