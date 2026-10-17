import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { post } from "../lib/api";
import { cn, fmtDate, fmtRange, inr, useApi } from "../lib/utils";
import { Empty, ErrorBox, Sheet, Skeleton, payBadge, statusBadge } from "../components/ui";

const TABS = [["upcoming", "Upcoming"], ["past", "Past"], ["cancelled", "Cancelled"]] as const;

export default function MyBookings() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("upcoming");
  const { data, error, loading, reload } = useApi<{ bookings: any[] }>(`/bookings/me?tab=${tab}`);
  const [cancelling, setCancelling] = useState<any>(null);
  const [utrFor, setUtrFor] = useState<any>(null);
  const [utr, setUtr] = useState("");

  const doCancel = async () => {
    try {
      const r = await post(`/bookings/${cancelling.id}/cancel`);
      toast.success(r.refundDue ? "Cancelled. The nets will contact you about your refund." : "Booking cancelled");
      setCancelling(null); reload();
    } catch (e: any) { toast.error(e.message); setCancelling(null); }
  };
  const sendUtr = async () => {
    try { await post(`/bookings/${utrFor.id}/utr`, { upiRef: utr }); toast.success("Payment details sent"); setUtrFor(null); setUtr(""); reload(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">My Bookings</h1>
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
        {TABS.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={cn("rounded-lg py-2 text-sm font-semibold", tab === v ? "bg-pitch text-white shadow-soft" : "text-slate-600 dark:text-slate-300")}>{l}</button>
        ))}
      </div>
      {loading ? <><Skeleton className="h-28" /><Skeleton className="h-28" /></>
        : error ? <ErrorBox message={error.message} retry={reload} />
        : !data?.bookings.length ? <Empty title={tab === "upcoming" ? "No upcoming bookings" : `No ${tab} bookings`} action={tab === "upcoming" ? <Link to="/book" className="btn-primary mt-2">Book a slot</Link> : undefined} />
        : data.bookings.map((b) => (
          <div key={b.id} className="card flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-heading text-lg font-semibold">{b.resource.name}</p><p className="text-sm">{fmtDate(b.date, true)} · {fmtRange(b.start, b.end)}</p></div>
              <div className="flex flex-col items-end gap-1">{statusBadge(b.status)}{b.status !== "cancelled" && payBadge(b)}</div>
            </div>
            <p className="text-sm text-slate-500">Code {b.code} · {inr(b.amount)}</p>
            <div className="flex flex-wrap gap-2">
              {b.canCancel && <button className="btn-ghost !py-2 text-sm text-ball" onClick={() => setCancelling(b)}>Cancel</button>}
              {tab === "upcoming" && b.status === "confirmed" && !b.canCancel && <span className="text-xs text-slate-500">Free cancellation has ended — contact the nets to cancel.</span>}
              {b.status === "confirmed" && b.paymentMode === "upi" && b.paymentStatus === "rejected" && <button className="btn-ghost !py-2 text-sm" onClick={() => setUtrFor(b)}>Re-enter UTR</button>}
              {tab !== "upcoming" && <Link to={`/book?type=${b.resource.type}`} className="btn-ghost !py-2 text-sm">Book again</Link>}
            </div>
          </div>
        ))}

      <Sheet open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this booking?">
        {cancelling && <p className="mb-4">{cancelling.resource.name}, {fmtDate(cancelling.date)} {fmtRange(cancelling.start, cancelling.end)}. The slot will be released for other players.</p>}
        <div className="grid grid-cols-2 gap-2"><button className="btn-ghost" onClick={() => setCancelling(null)}>Keep it</button><button className="btn-danger" onClick={doCancel}>Cancel booking</button></div>
      </Sheet>
      <Sheet open={!!utrFor} onClose={() => setUtrFor(null)} title="Enter UTR">
        <input className="input mb-3 tracking-widest" inputMode="numeric" maxLength={12} value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, ""))} placeholder="12-digit UTR" />
        <button className="btn-primary w-full" disabled={utr.length !== 12} onClick={sendUtr}>Submit</button>
      </Sheet>
    </div>
  );
}
