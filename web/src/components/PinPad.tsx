import { Delete } from "lucide-react";
import { useEffect } from "react";
import { cn, haptic } from "../lib/utils";

/** Numeric keypad with PIN dots. `slots` is how many dots to draw (6 shows 4-6 digit PINs). */
export function PinPad({ value, onChange, max = 6, slots = 6, onEnter, label }: {
  value: string; onChange: (v: string) => void; max?: number; slots?: number; onEnter?: () => void; label?: string;
}) {
  const press = (d: string) => { haptic(8); if (value.length < max) onChange(value + d); };
  const back = () => onChange(value.slice(0, -1));

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter") onEnter?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="mx-auto w-full max-w-xs" aria-label={label ?? "PIN keypad"}>
      <div className="mb-5 flex justify-center gap-3" aria-live="polite" aria-label={`${value.length} digits entered`}>
        {Array.from({ length: slots }).map((_, i) => (
          <span key={i} className={cn("h-3.5 w-3.5 rounded-full border-2 border-pitch transition", i < value.length ? "scale-110 bg-pitch" : "bg-transparent")} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="h-14 rounded-2xl bg-white text-2xl font-semibold shadow-soft transition active:scale-95 active:bg-pitch-50 dark:bg-[#12201a]">{d}</button>
        ))}
        <span />
        <button type="button" onClick={() => press("0")} className="h-14 rounded-2xl bg-white text-2xl font-semibold shadow-soft transition active:scale-95 dark:bg-[#12201a]">0</button>
        <button type="button" aria-label="Delete" onClick={back} className="flex h-14 items-center justify-center rounded-2xl text-slate-500 active:scale-95"><Delete size={26} /></button>
      </div>
    </div>
  );
}
