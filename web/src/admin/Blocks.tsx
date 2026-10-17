import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { del } from "../lib/api";
import { fmtDate, fmtRange, useApi } from "../lib/utils";
import { Empty, Sheet, Skeleton } from "../components/ui";
import { BlockForm } from "./forms";

export default function Blocks() {
  const { data, loading, reload } = useApi<{ blocks: any[] }>("/admin/blocks");
  const res = useApi<{ resources: any[] }>("/admin/resources");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between"><h1 className="font-heading text-2xl font-bold">Block slots</h1><button className="btn-primary !py-2" onClick={() => setOpen(true)}><Plus size={18} />New block</button></div>
      {loading ? <Skeleton className="h-32" /> : !data?.blocks.length ? <Empty title="No upcoming blocks" hint="Block slots for maintenance, coaching, rain or private events." /> : data.blocks.map((b) => (
        <div key={b.id} className="card flex items-center justify-between gap-2 p-3">
          <div className="text-sm"><b>{b.resource?.name ?? "All nets & machines"}</b><br />{fmtDate(b.date, true)} · {fmtRange(b.start, b.end)}<br /><span className="text-slate-500">{b.reason}</span></div>
          <button className="btn-ghost !py-2 text-sm" aria-label="Unblock" onClick={async () => { try { await del(`/admin/blocks/${b.id}`); toast.success("Unblocked"); reload(); } catch (e: any) { toast.error(e.message); } }}><Trash2 size={16} />Unblock</button>
        </div>
      ))}
      <Sheet open={open} onClose={() => setOpen(false)} title="Block slots">
        <BlockForm resources={(res.data?.resources ?? []).filter((r) => r.isActive)} onDone={() => { setOpen(false); reload(); }} />
      </Sheet>
    </div>
  );
}
