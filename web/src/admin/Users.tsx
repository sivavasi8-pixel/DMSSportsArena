import { useState } from "react";
import { toast } from "sonner";
import { patch, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate, fmtRange, inr, useApi } from "../lib/utils";
import { Badge, Empty, Sheet, Skeleton, statusBadge } from "../components/ui";

export default function Users() {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const { data, loading, reload } = useApi<{ users: any[] }>(`/admin/users?q=${encodeURIComponent(q)}`);
  const [sel, setSel] = useState<number | null>(null);
  const detail = useApi<any>(sel ? `/admin/users/${sel}` : null);
  const [temp, setTemp] = useState<string | null>(null);
  const isSuper = me?.role === "super_admin";

  const run = async (fn: () => Promise<any>, msg: string) => {
    try { const r = await fn(); toast.success(msg); if (r?.tempPin) setTemp(r.tempPin); reload(); detail.reload(); }
    catch (e: any) { toast.error(e.message); }
  };
  const u = detail.data?.user;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Users</h1>
      <input className="input" placeholder="Search name, mobile or username" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading ? <Skeleton className="h-48" /> : !data?.users.length ? <Empty title="No users found" /> : (
        <div className="card divide-y divide-black/5">
          {data.users.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-black/5">
              <span><b>{x.fullName}</b>{x.username && <span className="text-slate-500"> @{x.username}</span>}<br /><span className="text-sm text-slate-500">{x.mobile} · {x.bookingCount} bookings</span></span>
              <span className="flex flex-wrap justify-end gap-1">
                {x.role !== "user" && <Badge tone="blue">{x.role === "super_admin" ? "Owner" : "Admin"}</Badge>}
                {!x.isActive && <Badge tone="red">Inactive</Badge>}
                {x.lockedUntil && new Date(x.lockedUntil) > new Date() && <Badge tone="amber">Locked</Badge>}
                {x.noShows > 0 && <Badge tone="red">{x.noShows} no-show{x.noShows > 1 && "s"}</Badge>}
              </span>
            </button>
          ))}
        </div>
      )}
      <Sheet open={!!sel} onClose={() => { setSel(null); setTemp(null); }} title={u?.fullName ?? "User"}>
        {!u ? <Skeleton className="h-40" /> : (
          <div className="flex flex-col gap-3">
            {temp && <div className="rounded-xl bg-amber-100 p-3 text-center text-amber-900">Temporary PIN<br /><b className="font-heading text-3xl tracking-widest">{temp}</b><br /><span className="text-xs">Share it with the player. They must change it at next login.</span></div>}
            <p className="text-sm">{u.mobile}{u.username && ` · @${u.username}`}<br />Role: {u.role} · {u.playingRole ?? "—"} · {u.skillLevel ?? "—"}<br />No-shows: <b>{u.noShows}</b></p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-primary !py-2.5 text-sm" onClick={() => run(() => post(`/admin/users/${u.id}/reset-pin`), "PIN reset")}>Reset PIN</button>
              <button className="btn-ghost !py-2.5 text-sm" onClick={() => run(() => post(`/admin/users/${u.id}/unlock`), "Unlocked")}>Unlock</button>
              <button className="btn-ghost !py-2.5 text-sm" onClick={() => run(() => patch(`/admin/users/${u.id}`, { isActive: !u.isActive }), u.isActive ? "Deactivated" : "Activated")}>{u.isActive ? "Deactivate" : "Activate"}</button>
              {isSuper && u.role !== "super_admin" && <button className="btn-ghost !py-2.5 text-sm" onClick={() => run(() => post(`/admin/users/${u.id}/role`, { role: u.role === "admin" ? "user" : "admin" }), u.role === "admin" ? "Admin removed" : "Made admin — give them the temporary PIN")}>{u.role === "admin" ? "Remove admin" : "Make admin"}</button>}
            </div>
            <h3 className="font-heading font-semibold">Booking history</h3>
            <div className="max-h-56 overflow-auto text-sm">
              {detail.data.bookings.length === 0 ? <p className="text-slate-500">None yet</p> : detail.data.bookings.map((b: any) => (
                <div key={b.id} className="flex justify-between border-b border-black/5 py-1.5"><span>{fmtDate(b.date)} {fmtRange(b.start, b.end)} · {b.resource.name}</span><span className="flex items-center gap-2">{inr(b.amount)}{statusBadge(b.status)}</span></div>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
