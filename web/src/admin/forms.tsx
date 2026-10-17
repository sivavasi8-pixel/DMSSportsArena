import { useEffect, useState } from "react";
import { toast } from "sonner";
import { get, post } from "../lib/api";
import { cn, fmtDate, fmtRange, todayIST, waLink } from "../lib/utils";
import { Field } from "../components/ui";

type Res = { id: number; name: string; type: string };

export function BlockForm({ resources, init, onDone }: {
  resources: Res[]; init?: { resourceIds?: number[]; date?: string; start?: string; end?: string }; onDone: () => void;
}) {
  const [all, setAll] = useState(!init?.resourceIds?.length);
  const [ids, setIds] = useState<number[]>(init?.resourceIds ?? []);
  const [from, setFrom] = useState(init?.date ?? todayIST());
  const [to, setTo] = useState(init?.date ?? todayIST());
  const [start, setStart] = useState(init?.start ?? "06:00");
  const [end, setEnd] = useState(init?.end ?? "07:00");
  const [reason, setReason] = useState("Maintenance");
  const [conflicts, setConflicts] = useState<any[] | null>(null);
  const [cancelled, setCancelled] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (cancelBookings = false) => {
    setBusy(true);
    try {
      const r = await post("/admin/blocks", { resourceIds: all ? null : ids, from, to, start, end, reason, cancelBookings });
      toast.success("Slots blocked");
      if (r.cancelled?.length) setCancelled(r.cancelled); else onDone();
    } catch (e: any) {
      if (e.data?.code === "HAS_BOOKINGS") setConflicts(e.data.bookings); else toast.error(e.message);
    } finally { setBusy(false); }
  };

  if (cancelled) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-medium">Bookings cancelled. Let these players know:</p>
        {cancelled.map((b) => (
          <a key={b.id} target="_blank" rel="noreferrer" className="btn-ghost justify-between text-sm"
            href={waLink(b.user.mobile, `Hi ${b.user.fullName}, your booking ${b.code} (${b.resource.name}, ${fmtDate(b.date)} ${fmtRange(b.start, b.end)}) at DMS Sports Arena had to be cancelled (${reason}). Sorry for the trouble — please rebook another slot.`)}>
            <span>{b.user.fullName} · {b.resource.name} {b.start}</span><span>WhatsApp</span>
          </a>
        ))}
        <button className="btn-primary" onClick={onDone}>Done</button>
      </div>
    );
  }
  if (conflicts) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">{conflicts.length} existing booking(s) overlap this block:</p>
        <ul className="max-h-48 overflow-auto text-sm">{conflicts.map((b) => <li key={b.id} className="border-b border-black/5 py-1">{fmtDate(b.date)} {fmtRange(b.start, b.end)} · {b.resource.name} · {b.user.fullName}</li>)}</ul>
        <button className="btn-danger" disabled={busy} onClick={() => submit(true)}>Block and cancel these bookings</button>
        <button className="btn-ghost" onClick={() => setConflicts(null)}>Go back</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="label">Applies to</span>
        <div className="flex flex-wrap gap-2">
          <Chip on={all} onClick={() => setAll(true)}>All</Chip>
          {resources.map((r) => <Chip key={r.id} on={!all && ids.includes(r.id)} onClick={() => { setAll(false); setIds((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id])); }}>{r.name}</Chip>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From date"><input type="date" className="input" value={from} min={todayIST()} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} /></Field>
        <Field label="To date"><input type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Start"><input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Reason"><input className="input" value={reason} maxLength={100} onChange={(e) => setReason(e.target.value)} placeholder="Maintenance, coaching, rain…" /></Field>
      <button className="btn-primary" disabled={busy || (!all && !ids.length)} onClick={() => submit(false)}>Block slots</button>
    </div>
  );
}

export const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className={cn("rounded-full border px-3.5 py-2 text-sm font-medium", on ? "border-pitch bg-pitch text-white" : "border-slate-300 dark:border-white/20")}>{children}</button>
);

export function WalkInForm({ slots, onDone }: { slots: { resourceId: number; date: string; start: string; label: string }[]; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [pay, setPay] = useState<"later" | "cash" | "upi">("cash");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ tempPin: string } | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => get(`/admin/users?q=${encodeURIComponent(q)}`).then((r) => setResults(r.users.slice(0, 5))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await post("/admin/bookings", {
        userId: user?.id, newUser: user ? undefined : { fullName: name, mobile },
        slots: slots.map(({ resourceId, date, start }) => ({ resourceId, date, start })),
        paymentMode: pay === "upi" ? "upi" : "at_nets", paid: pay === "later" ? undefined : pay,
      });
      toast.success("Booking created");
      if (r.createdUser) setCreated(r.createdUser); else onDone();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  if (created) return (
    <div className="flex flex-col gap-3 text-center">
      <p>New player created. Their temporary PIN (they must change it at first login):</p>
      <p className="font-heading text-3xl font-bold tracking-widest">{created.tempPin}</p>
      <button className="btn-primary" onClick={onDone}>Done</button>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-black/5 p-3 text-sm dark:bg-white/10">{slots.map((s) => s.label).join(" · ")}</p>
      {user ? (
        <div className="card flex items-center justify-between p-3"><span><b>{user.fullName}</b> · {user.mobile}</span><button className="text-sm underline" onClick={() => setUser(null)}>Change</button></div>
      ) : (
        <>
          <Field label="Find existing player"><input className="input" placeholder="Name or mobile" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          {results.map((u) => <button key={u.id} className="btn-ghost justify-between text-sm" onClick={() => setUser(u)}><span>{u.fullName}</span><span>{u.mobile}</span></button>)}
          <p className="text-center text-xs text-slate-500">— or add a new player —</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Mobile"><input className="input" inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} /></Field>
          </div>
        </>
      )}
      <div>
        <span className="label">Payment</span>
        <div className="flex flex-wrap gap-2">
          <Chip on={pay === "cash"} onClick={() => setPay("cash")}>Paid cash</Chip>
          <Chip on={pay === "upi"} onClick={() => setPay("upi")}>Paid UPI</Chip>
          <Chip on={pay === "later"} onClick={() => setPay("later")}>Pay later</Chip>
        </div>
      </div>
      <button className="btn-primary" disabled={busy || (!user && (name.trim().length < 2 || mobile.length !== 10))} onClick={submit}>Create booking</button>
    </div>
  );
}
