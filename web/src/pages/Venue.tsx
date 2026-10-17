import { AnimatePresence, motion } from "framer-motion";
import { MapPin, MessageCircle, Navigation, Phone, X } from "lucide-react";
import { useState } from "react";
import { Empty, ErrorBox, Skeleton } from "../components/ui";
import { fmtTime, useApi } from "../lib/utils";

export type VenueData = {
  venue: { name: string; address: string; mapEmbedUrl: string; mapLink: string; contactPhone: string; whatsapp: string; upiId?: string; upiPayeeName?: string; cancellationHours: number; maxAdvanceDays: number; maxBookingsPerDay: number };
  photos: { id: number; caption: string | null; url: string; isCover: boolean }[];
  hours: { dayOfWeek: number; openTime: string; closeTime: string }[];
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ContactButtons({ v }: { v: VenueData["venue"] }) {
  const wa = v.whatsapp.replace(/\D/g, "");
  return (
    <div className="grid grid-cols-3 gap-2">
      {v.mapLink && <a className="btn-ghost !px-2 text-sm" href={v.mapLink} target="_blank" rel="noreferrer"><Navigation size={16} />Directions</a>}
      {v.contactPhone && <a className="btn-ghost !px-2 text-sm" href={`tel:${v.contactPhone}`}><Phone size={16} />Call</a>}
      {wa && <a className="btn-ghost !px-2 text-sm" href={`https://wa.me/${wa.length === 10 ? "91" + wa : wa}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>}
    </div>
  );
}

export default function Venue() {
  const { data, error, loading, reload } = useApi<VenueData>("/venue");
  const [lightbox, setLightbox] = useState<number | null>(null);
  if (loading) return <Skeleton className="h-96" />;
  if (error || !data) return <ErrorBox message={error?.message ?? "Could not load"} retry={reload} />;
  const { venue: v, photos, hours } = data;
  // Collapse identical days into one line when everything is the same.
  const same = hours.length === 7 && hours.every((h) => h.openTime === hours[0].openTime && h.closeTime === hours[0].closeTime);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">{v.name}</h1>
      {photos.length ? (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => setLightbox(i)} className={`overflow-hidden rounded-2xl ${i === 0 ? "col-span-2" : ""}`}>
              <img src={p.url} alt={p.caption ?? "Venue photo"} loading="lazy" className={`w-full object-cover ${i === 0 ? "h-52" : "h-32"}`} />
            </button>
          ))}
        </div>
      ) : <Empty title="No photos yet" hint="The nets will add photos soon." />}

      <div className="card flex flex-col gap-3 p-4">
        <div className="flex gap-2"><MapPin className="mt-0.5 shrink-0 text-ball" size={18} /><p>{v.address || "Address coming soon"}</p></div>
        {v.mapEmbedUrl && <iframe title="Map" src={v.mapEmbedUrl} className="h-56 w-full rounded-xl border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />}
        <ContactButtons v={v} />
      </div>

      <div className="card p-4">
        <h2 className="mb-2 font-heading font-semibold">Timings</h2>
        {hours.length === 0 ? <p className="text-sm text-slate-500">Not set</p> : same ? (
          <p>Every day · {fmtTime(hours[0].openTime)} – {fmtTime(hours[0].closeTime)}</p>
        ) : hours.map((h) => <p key={h.dayOfWeek} className="flex justify-between text-sm"><span>{DAYS[h.dayOfWeek]}</span><span>{fmtTime(h.openTime)} – {fmtTime(h.closeTime)}</span></p>)}
        <p className="mt-3 text-xs text-slate-500">Free cancellation up to {v.cancellationHours} hours before the slot. Book up to {v.maxAdvanceDays} days ahead.</p>
      </div>

      <AnimatePresence>
        {lightbox !== null && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLightbox(null)}>
            <button aria-label="Close" className="absolute right-4 top-4 text-white"><X size={28} /></button>
            <div className="max-w-full text-center" onClick={(e) => e.stopPropagation()}>
              <img src={photos[lightbox].url} alt={photos[lightbox].caption ?? ""} className="max-h-[80vh] max-w-full rounded-xl" />
              {photos[lightbox].caption && <p className="mt-2 text-white">{photos[lightbox].caption}</p>}
              <div className="mt-3 flex justify-center gap-3">
                <button className="btn-ghost !bg-white/15 !text-white" onClick={() => setLightbox((lightbox - 1 + photos.length) % photos.length)}>Prev</button>
                <button className="btn-ghost !bg-white/15 !text-white" onClick={() => setLightbox((lightbox + 1) % photos.length)}>Next</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
