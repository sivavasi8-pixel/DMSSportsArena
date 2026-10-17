import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "../lib/utils";

export function Logo({ className = "h-10 w-10" }: { className?: string }) {
  return <img src="/icon.svg" alt="DMS Sports Arena" className={cn("rounded-2xl", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "green" | "amber" | "red" | "blue" }) {
  const t = {
    gray: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
    green: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    red: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    blue: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", t)}>{children}</span>;
}

export const statusBadge = (s: string) =>
  ({ confirmed: <Badge tone="green">Confirmed</Badge>, completed: <Badge tone="blue">Completed</Badge>, cancelled: <Badge tone="red">Cancelled</Badge>, no_show: <Badge tone="red">No-show</Badge>, held: <Badge tone="amber">On hold</Badge> } as Record<string, ReactNode>)[s] ?? <Badge>{s}</Badge>;

export function payBadge(b: { paymentStatus: string; paymentMode: string | null; status?: string }) {
  if (b.paymentStatus === "paid") return <Badge tone="green">Paid</Badge>;
  if (b.paymentStatus === "verification") return <Badge tone="amber">Verifying UPI</Badge>;
  if (b.paymentStatus === "refunded") return <Badge tone="gray">Refunded</Badge>;
  if (b.paymentStatus === "rejected") return <Badge tone="red">Payment rejected</Badge>;
  return <Badge tone="amber">{b.paymentMode === "at_nets" ? "Pay at nets" : "Payment pending"}</Badge>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r="26" fill="#DC2626" opacity=".9" />
        <path d="M18 26c10 7 10 13 0 20M54 26c-10 7-10 13 0 20" stroke="#fff" strokeWidth="2.5" fill="none" strokeDasharray="1 5" strokeLinecap="round" />
      </svg>
      <p className="font-heading text-lg font-semibold">{title}</p>
      {hint && <p className="text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="card border-red-200 p-4 text-center">
      <p className="text-sm text-ball">{message}</p>
      {retry && <button className="btn-ghost mt-3" onClick={retry}>Try again</button>}
    </div>
  );
}

/** Bottom sheet on mobile, centred dialog on larger screens. */
export function Sheet({ open, onClose, title, children, dismissible = true }: { open: boolean; onClose: () => void; title: string; children: ReactNode; dismissible?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && dismissible && onClose();
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [open, onClose, dismissible]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => dismissible && onClose()}>
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 dark:bg-[#12201a] sm:rounded-3xl"
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-xl font-semibold">{title}</h2>
              {dismissible && <button aria-label="Close" onClick={onClose} className="rounded-full p-2 hover:bg-black/5"><X size={20} /></button>}
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
