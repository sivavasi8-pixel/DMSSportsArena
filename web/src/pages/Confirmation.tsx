import { CalendarPlus, CheckCircle2, MessageCircle, Navigation } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { payBadge } from "../components/ui";
import { fmtDate, fmtRange, gcalLink, inr } from "../lib/utils";

export default function Confirmation() {
  const { state } = useLocation() as { state?: { bookings: any[]; venue?: any } };
  if (!state?.bookings?.length) return <Navigate to="/bookings" replace />;
  const { bookings, venue } = state;
  const total = bookings.reduce((a, b) => a + b.amount, 0);
  const share = bookings.map((b) => `${b.resource.name}, ${fmtDate(b.date)} ${fmtRange(b.start, b.end)} (${b.code})`).join("\n");
  const text = `I booked at ${venue?.name ?? "DMS Sports Arena"}:\n${share}\nTotal ${inr(total)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 size={64} className="text-turf" />
        <h1 className="font-heading text-2xl font-bold">You're booked!</h1>
        <p className="text-sm text-slate-500">{bookings.length} slot{bookings.length > 1 && "s"} · {inr(total)}</p>
      </div>
      {bookings.map((b) => (
        <div key={b.id} className="card flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between"><b className="font-heading text-lg">{b.resource.name}</b>{payBadge(b)}</div>
          <p>{fmtDate(b.date, true)} · {fmtRange(b.start, b.end)}</p>
          <p className="text-sm text-slate-500">Code <b className="tracking-wider text-slate-800 dark:text-white">{b.code}</b> · {inr(b.amount)}</p>
          <a className="btn-ghost text-sm" target="_blank" rel="noreferrer" href={gcalLink(`Cricket: ${b.resource.name}`, b.date, b.start, b.end, venue?.address ?? "DMS Sports Arena")}><CalendarPlus size={16} />Add to Google Calendar</a>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <a className="btn-primary" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}><MessageCircle size={18} />Share</a>
        {venue?.mapLink ? <a className="btn-ghost" target="_blank" rel="noreferrer" href={venue.mapLink}><Navigation size={18} />Directions</a> : <Link className="btn-ghost" to="/venue">Venue info</Link>}
      </div>
      <Link to="/bookings" className="btn-ghost">View my bookings</Link>
    </div>
  );
}
