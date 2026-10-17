import imageCompression from "browser-image-compression";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, del, patch } from "../lib/api";
import { useApi } from "../lib/utils";
import { Field, Skeleton } from "../components/ui";

export default function VenueAdmin() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold">Venue &amp; Photos</h1>
      <VenueForm /><Photos />
    </div>
  );
}

function VenueForm() {
  const { data, loading } = useApi<{ settings: any }>("/admin/venue");
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (data) setF(data.settings); }, [data]);
  if (loading || !f) return <Skeleton className="h-96" />;
  const t = (k: string, label: string, props: any = {}) => (
    <Field label={label}><input className="input" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} /></Field>
  );
  const save = async () => {
    try {
      const { id, ...rest } = f;
      await patch("/admin/venue", { ...rest, lat: rest.lat === "" || rest.lat == null ? null : Number(rest.lat), lng: rest.lng === "" || rest.lng == null ? null : Number(rest.lng) });
      toast.success("Venue saved");
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <section className="card grid gap-3 p-4 sm:grid-cols-2">
      {t("venueName", "Venue name")}{t("contactPhone", "Contact phone", { inputMode: "tel" })}
      <div className="sm:col-span-2">{t("address", "Address")}</div>
      {t("whatsapp", "WhatsApp number", { inputMode: "tel" })}{t("mapLink", "Google Maps link (for Directions)")}
      <div className="sm:col-span-2">{t("mapEmbedUrl", "Google Maps embed URL", { placeholder: "https://www.google.com/maps/embed?pb=…" })}
        <p className="mt-1 text-xs text-slate-500">In Google Maps: Share → Embed a map → copy the src="…" address only.</p></div>
      {t("upiId", "UPI ID", { placeholder: "name@bank" })}{t("upiPayeeName", "UPI payee name")}
      <button className="btn-primary sm:col-span-2" onClick={save}>Save venue</button>
    </section>
  );
}

function Photos() {
  const { data, loading, reload } = useApi<any>("/venue");
  const [order, setOrder] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const drag = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (data) setOrder(data.photos); }, [data]);

  const upload = async (files: FileList | File[]) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) { toast.error(`${file.name} is not an image`); continue; }
        const small = await imageCompression(file, { maxSizeMB: 0.19, maxWidthOrHeight: 1600, useWebWorker: true, fileType: "image/jpeg" });
        const fd = new FormData();
        fd.append("file", small, "photo.jpg");
        await api("/admin/photos", { form: fd });
      }
      toast.success("Photos uploaded"); reload();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const run = async (fn: () => Promise<any>) => { try { await fn(); reload(); } catch (e: any) { toast.error(e.message); } };
  const drop = (to: number) => {
    const from = drag.current; drag.current = null;
    if (from === null || from === to) return;
    const next = [...order]; const [m] = next.splice(from, 1); next.splice(to, 0, m);
    setOrder(next);
    run(() => patch("/admin/photos/order", { ids: next.map((p) => p.id) }));
  };

  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="font-heading font-semibold">Photo gallery</h2>
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
        className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500" onClick={() => input.current?.click()}>
        <ImagePlus /> {busy ? "Compressing & uploading…" : "Drop photos here or tap to choose"}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
      {loading ? <Skeleton className="h-32" /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {order.map((p, i) => (
            <div key={p.id} draggable onDragStart={() => (drag.current = i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)} className="card overflow-hidden">
              <img src={p.url} alt={p.caption ?? ""} className="h-28 w-full object-cover" />
              <div className="flex flex-col gap-1 p-2">
                <input className="input !py-1.5 text-xs" placeholder="Caption" defaultValue={p.caption ?? ""} onBlur={(e) => e.target.value !== (p.caption ?? "") && run(() => patch(`/admin/photos/${p.id}`, { caption: e.target.value || null }))} />
                <div className="flex justify-between">
                  <button className={`flex items-center gap-1 text-xs ${p.isCover ? "font-bold text-amber-600" : "text-slate-500"}`} onClick={() => run(() => patch(`/admin/photos/${p.id}`, { isCover: true }))}><Star size={14} fill={p.isCover ? "currentColor" : "none"} />{p.isCover ? "Cover" : "Make cover"}</button>
                  <button aria-label="Delete photo" className="text-ball" onClick={() => confirm("Delete this photo?") && run(() => del(`/admin/photos/${p.id}`))}><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">Drag photos to reorder. Images are compressed to under 200 KB before upload.</p>
    </section>
  );
}
