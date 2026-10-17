import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { patch } from "../lib/api";
import { fmtDate, fmtRange, inr, todayIST, useApi } from "../lib/utils";
import { Empty, ErrorBox, Sheet, Skeleton, payBadge, statusBadge } from "../components/ui";
import { BookingActions } from "./Schedule";

function Table({ rows, onOpen }: { rows: any[]; onOpen: (b: any) => void }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-black/5 text-xs uppercase text-slate-500"><tr>{["Code", "When", "Resource", "Player", "Status", "Payment", "Amount"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="cursor-pointer border-b border-black/5 hover:bg-black/5" onClick={() => onOpen(b)}>
              <td className="p-3 font-mono text-xs">{b.code}</td>
              <td className="p-3">{fmtDate(b.date)}<br /><span className="text-xs text-slate-500">{fmtRange(b.start, b.end)}</span></td>
              <td className="p-3">{b.resource.name}</td>
              <td className="p-3">{b.user.fullName}<br /><span className="text-xs text-slate-500">{b.user.mobile}</span></td>
              <td className="p-3">{statusBadge(b.status)}</td>
              <td className="p-3">{payBadge(b)}</td>
              <td className="p-3 font-semibold">{inr(b.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Bookings() {
  const [f, setF] = useState({ from: todayIST(), to: "", status: "", paymentStatus: "", q: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, error, loading, reload } = useApi<{ bookings: any[] }>(`/admin/bookings?${qs}`);
  const [open, setOpen] = useState<any>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between"><h1 className="font-heading text-2xl font-bold">Bookings</h1>
        <a className="btn-ghost !py-2 text-sm" href={`/api/admin/bookings?${qs}&format=csv`}><Download size={16} />CSV</a></div>
      <div className="card grid grid-cols-2 gap-3 p-3 lg:grid-cols-5">
        <input className="input col-span-2 lg:col-span-1" placeholder="Search name, mobile, code, UTR" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <input type="date" className="input" aria-label="From" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <input type="date" className="input" aria-label="To" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <select className="input" aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Any status</option>{["confirmed", "completed", "cancelled", "no_show"].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input" aria-label="Payment" value={f.paymentStatus} onChange={(e) => setF({ ...f, paymentStatus: e.target.value })}>
          <option value="">Any payment</option>{["pending", "verification", "paid", "rejected", "refunded"].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      {loading ? <Skeleton className="h-64" /> : error ? <ErrorBox message={error.message} retry={reload} /> : !data?.bookings.length ? <Empty title="No bookings match" /> : <Table rows={data.bookings} onOpen={setOpen} />}
      <Sheet open={!!open} onClose={() => setOpen(null)} title="Booking">{open && <BookingActions booking={open} onChanged={() => { setOpen(null); reload(); }} />}</Sheet>
    </div>
  );
}

export function Payments() {
  const { data, error, loading, reload } = useApi<{ bookings: any[] }>("/admin/bookings?paymentStatus=verification&status=confirmed&limit=200");
  const [range, setRange] = useState({ from: todayIST().slice(0, 8) + "01", to: todayIST() });
  const rep = useApi<any>(`/admin/reports/collections?from=${range.from}&to=${range.to}`);
  const act = async (id: number, body: any, msg: string) => {
    try { await patch(`/admin/bookings/${id}`, body); toast.success(msg); reload(); rep.reload(); } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Payments</h1>
      <section>
        <h2 className="mb-2 font-heading font-semibold">To verify</h2>
        {loading ? <Skeleton className="h-24" /> : error ? <ErrorBox message={error.message} retry={reload} /> : !data?.bookings.length ? <Empty title="All caught up" hint="No UPI payments waiting for verification." /> : (
          <div className="flex flex-col gap-2">
            {data.bookings.map((b) => (
              <div key={b.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="text-sm"><b>{b.user.fullName}</b> · {b.user.mobile}<br />{b.resource.name} · {fmtDate(b.date)} {fmtRange(b.start, b.end)}<br />UTR <b className="font-mono">{b.upiRef}</b> · <b>{inr(b.amount)}</b></div>
                <div className="flex gap-2">
                  <button className="btn-primary !py-2 text-sm" onClick={() => act(b.id, { paymentStatus: "paid", paidVia: "upi" }, "Marked paid")}>Mark paid</button>
                  <button className="btn-danger !py-2 text-sm" onClick={() => act(b.id, { paymentStatus: "rejected" }, "Rejected")}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading font-semibold">Collections</h2>
          <div className="flex items-center gap-2">
            <input type="date" className="input !w-auto !py-2" aria-label="From" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <input type="date" className="input !w-auto !py-2" aria-label="To" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            <a className="btn-ghost !py-2 text-sm" href={`/api/admin/reports/collections?from=${range.from}&to=${range.to}&format=csv`}><Download size={16} />CSV</a>
          </div>
        </div>
        {rep.data && (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              {[["UPI", rep.data.totals.upi], ["Cash", rep.data.totals.cash], ["Pending", rep.data.totals.pending]].map(([l, v]) => <div key={l as string} className="rounded-xl bg-black/5 p-3 dark:bg-white/10"><p className="text-xs text-slate-500">{l}</p><p className="font-heading text-xl font-bold">{inr(v as number)}</p></div>)}
            </div>
            <table className="w-full text-sm"><thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Date</th><th>UPI</th><th>Cash</th><th>Pending</th></tr></thead>
              <tbody>{rep.data.days.map((d: any) => <tr key={d.date} className="border-t border-black/5"><td className="py-1.5">{fmtDate(d.date)}</td><td>{inr(d.upi)}</td><td>{inr(d.cash)}</td><td>{inr(d.pending)}</td></tr>)}</tbody></table>
          </>
        )}
      </section>
    </div>
  );
}
