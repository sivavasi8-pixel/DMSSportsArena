import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { CalendarCheck, IndianRupee, PieChart, ShieldCheck } from "lucide-react";
import { ErrorBox, Skeleton } from "../components/ui";
import { fmtDate, fmtRange, inr, useApi } from "../lib/utils";

export default function Dashboard() {
  const { data: d, error, loading, reload } = useApi<any>("/admin/dashboard", { poll: 30000 });
  if (loading) return <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;
  if (error || !d) return <ErrorBox message={error?.message ?? "Failed to load"} retry={reload} />;
  const stat = (icon: React.ReactNode, label: string, value: string, to?: string, warn?: boolean) => {
    const body = (<div className={`card flex items-center gap-3 p-4 ${warn ? "ring-2 ring-amber-400" : ""}`}><div className="rounded-xl bg-pitch-50 p-3 text-pitch dark:bg-pitch/30 dark:text-turf">{icon}</div><div><p className="text-xs text-slate-500">{label}</p><p className="font-heading text-2xl font-bold">{value}</p></div></div>);
    return to ? <Link to={to}>{body}</Link> : body;
  };
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(<CalendarCheck />, "Bookings today", String(d.todayCount), "/admin/schedule")}
        {stat(<IndianRupee />, "Revenue today", inr(d.revenueToday))}
        {stat(<IndianRupee />, "Revenue this month", inr(d.revenueMonth))}
        {stat(<PieChart />, "Occupancy today", `${d.occupancy}%`)}
      </div>
      {d.toVerify > 0 && <Link to="/admin/payments" className="card flex items-center gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900"><ShieldCheck /> <b>{d.toVerify}</b> UPI payment{d.toVerify > 1 && "s"} to verify</Link>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 font-heading font-semibold">Next up today</h2>
          {d.next.length === 0 ? <p className="text-sm text-slate-500">Nothing else booked today.</p> : d.next.map((b: any) => (
            <div key={b.id} className="flex justify-between border-b border-black/5 py-2 text-sm last:border-0"><span><b>{b.resource.name}</b> · {fmtRange(b.start, b.end)}</span><span>{b.user?.fullName}</span></div>
          ))}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-heading font-semibold">Last 7 days</h2>
          <div className="h-48" aria-label="Bookings in the last 7 days">
            <ResponsiveContainer>
              <BarChart data={d.chart.map((c: any) => ({ ...c, day: fmtDate(c.date).split(",")[0] }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" fontSize={12} /><YAxis allowDecimals={false} fontSize={12} width={24} />
                <Tooltip /><Bar dataKey="count" name="Bookings" fill="#22C55E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
