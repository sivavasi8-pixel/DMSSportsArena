import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cog, Target, MapPin } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fmtDate, fmtRange, slotStartMs, useApi } from "../lib/utils";
import { Skeleton, statusBadge } from "../components/ui";
import { ContactButtons, type VenueData } from "./Venue";

function Countdown({ date, start }: { date: string; start: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const ms = slotStartMs(date, start) - Date.now();
  if (ms <= 0) return <span>Starting now</span>;
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return <span>{d ? `in ${d}d ${h}h` : h ? `in ${h}h ${m % 60}m` : `in ${m}m`}</span>;
}

export default function Home() {
  const { user } = useAuth();
  const venue = useApi<VenueData>("/venue");
  const mine = useApi<{ bookings: any[] }>("/bookings/me?tab=upcoming");
  const [slide, setSlide] = useState(0);
  const photos = venue.data?.photos ?? [];
  useEffect(() => {
    if (photos.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % photos.length), 4000);
    return () => clearInterval(t);
  }, [photos.length]);

  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const next = mine.data?.bookings[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-slate-500">{hello}</p>
        <h1 className="font-heading text-2xl font-bold">{user?.fullName.split(" ")[0]} 👋</h1>
      </div>

      {venue.loading ? <Skeleton className="h-48" /> : photos.length > 0 && (
        <Link to="/venue" className="relative block h-48 overflow-hidden rounded-card shadow-soft">
          {photos.map((p, i) => (
            <img key={p.id} src={p.url} alt={p.caption ?? "Nets"} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${i === slide ? "opacity-100" : "opacity-0"}`} />
          ))}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 p-3 text-white">
            <p className="font-heading font-semibold">{venue.data?.venue.name}</p>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link to="/book?type=net" className="card flex flex-col gap-2 bg-pitch p-4 !text-white !bg-pitch">
          <Target size={28} /><span className="font-heading text-lg font-semibold">Book a Net</span><span className="text-xs opacity-80">Pick your lane &amp; time</span>
        </Link>
        <Link to="/book?type=bowling_machine" className="card flex flex-col gap-2 p-4">
          <Cog size={28} className="text-ball" /><span className="font-heading text-lg font-semibold">Bowling Machine</span><span className="text-xs text-slate-500">Practise against the machine</span>
        </Link>
      </div>

      <section>
        <h2 className="mb-2 font-heading font-semibold">Next booking</h2>
        {mine.loading ? <Skeleton className="h-24" /> : next ? (
          <Link to="/bookings" className="card flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{next.resource?.name}</p>
              <p className="text-sm text-slate-500">{fmtDate(next.date, true)} · {fmtRange(next.start, next.end)}</p>
              <p className="mt-1 text-sm font-medium text-pitch dark:text-turf"><Countdown date={next.date} start={next.start} /></p>
            </div>
            {statusBadge(next.status)}
          </Link>
        ) : (
          <div className="card p-4 text-sm text-slate-500">No upcoming bookings. <Link to="/book" className="font-semibold text-pitch underline dark:text-turf">Book a slot</Link></div>
        )}
      </section>

      {venue.data && (
        <section className="card flex flex-col gap-3 p-4">
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 shrink-0 text-ball" size={18} />
            <div><p className="font-semibold">{venue.data.venue.name}</p><p className="text-sm text-slate-500">{venue.data.venue.address || "Address coming soon"}</p></div>
          </div>
          {venue.data.venue.mapEmbedUrl && <iframe title="Map" src={venue.data.venue.mapEmbedUrl} className="h-36 w-full rounded-xl border-0" loading="lazy" />}
          <ContactButtons v={venue.data.venue} />
          <Link to="/venue" className="text-center text-sm font-medium text-pitch underline dark:text-turf">Photos, timings &amp; more</Link>
        </section>
      )}
    </div>
  );
}
