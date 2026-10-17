import { useState } from "react";
import { toast } from "sonner";
import { PinPad } from "../components/PinPad";
import { Logo } from "../components/ui";
import { post } from "../lib/api";
import { isAdmin, useAuth } from "../lib/auth";

/** Used for the forced change after an admin reset, and from Profile. */
export default function ChangePin({ forced, onDone }: { forced?: boolean; onDone?: () => void }) {
  const { user, refresh, logout } = useAuth();
  const need6 = isAdmin(user);
  const [stage, setStage] = useState<"old" | "new" | "again">("old");
  const [oldPin, setOld] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const len = need6 ? 6 : 0;

  const submit = async (confirm: string) => {
    if (confirm !== pin) { toast.error("PINs do not match"); setAgain(""); return; }
    setBusy(true);
    try {
      await post("/auth/change-pin", { oldPin, newPin: pin });
      toast.success("PIN changed");
      await refresh();
      onDone?.();
    } catch (e: any) {
      toast.error(e.message);
      setStage("old"); setOld(""); setPin(""); setAgain("");
    } finally { setBusy(false); }
  };

  const title = stage === "old" ? (forced ? "Enter your temporary PIN" : "Enter your current PIN") : stage === "new" ? `Choose a new ${need6 ? "6" : "4 or 6"} digit PIN` : "Enter the new PIN again";

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-5 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <Logo className="h-14 w-14" />
        <h1 className="font-heading text-xl font-bold">{forced ? "Set a new PIN" : "Change PIN"}</h1>
        {forced && <p className="text-sm text-slate-500">For your safety, replace the temporary PIN before continuing.</p>}
        <p className="font-medium">{title}</p>
      </div>
      {stage === "old" && <PinPad value={oldPin} onChange={setOld} />}
      {stage === "new" && <PinPad value={pin} onChange={setPin} slots={len || 6} max={len || 6} />}
      {stage === "again" && <PinPad value={again} onChange={(v) => { setAgain(v); if (v.length === pin.length) submit(v); }} slots={pin.length} max={pin.length} />}
      {stage === "old" && <button className="btn-primary" disabled={oldPin.length < 4} onClick={() => setStage("new")}>Next</button>}
      {stage === "new" && <button className="btn-primary" disabled={need6 ? pin.length !== 6 : pin.length !== 4 && pin.length !== 6} onClick={() => setStage("again")}>Next</button>}
      {busy && <p className="text-center text-sm text-slate-500">Saving…</p>}
      {forced ? <button className="text-sm text-slate-500 underline" onClick={logout}>Log out</button> : <button className="text-sm text-slate-500 underline" onClick={onDone}>Cancel</button>}
    </div>
  );
}
