import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { PinPad } from "../components/PinPad";
import { Field, Logo } from "../components/ui";
import { post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";

const ROLES = [["batsman", "Batsman"], ["bowler", "Bowler"], ["all-rounder", "All-rounder"], ["keeper", "Keeper"]];
const LEVELS = [["beginner", "Beginner"], ["intermediate", "Intermediate"], ["advanced", "Advanced"]];

export default function Signup() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ fullName: "", mobile: "", username: "", pin: "", pin2: "", email: "", dob: "", playingRole: "", skillLevel: "" });
  const [pinStage, setPinStage] = useState<"set" | "confirm">("set");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const next = () => {
    if (f.fullName.trim().length < 2) return toast.error("Enter your full name");
    if (!/^\d{10}$/.test(f.mobile)) return toast.error("Mobile must be 10 digits");
    if (f.username && !/^[A-Za-z0-9_]{3,20}$/.test(f.username)) return toast.error("Username: 3–20 letters, digits or underscore");
    if (f.pin.length !== 4 && f.pin.length !== 6) return toast.error("PIN must be 4 or 6 digits");
    if (f.pin !== f.pin2) return toast.error("PINs do not match");
    setStep(2);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const body: any = { ...f };
      for (const k of Object.keys(body)) if (body[k] === "") delete body[k];
      await post("/auth/signup", body);
      await refresh();
      toast.success("Welcome to DMS Sports Arena!");
      nav("/home", { replace: true });
    } catch (e: any) {
      toast.error(e.message);
      if (/PIN/.test(e.message)) { setStep(1); set("pin", ""); set("pin2", ""); setPinStage("set"); } else if (/mobile|username/i.test(e.message)) setStep(1);
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto min-h-screen max-w-sm px-5 py-6">
      <div className="mb-5 flex items-center gap-3">
        {step === 2 ? <button aria-label="Back" onClick={() => setStep(1)}><ArrowLeft /></button> : <Link to="/login" aria-label="Back"><ArrowLeft /></Link>}
        <Logo className="h-9 w-9" />
        <h1 className="font-heading text-xl font-bold">Create account</h1>
        <span className="ml-auto text-xs text-slate-500">Step {step} of 2</span>
      </div>

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <Field label="Full name"><input className="input" autoComplete="name" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
          <Field label="Mobile number" hint="10 digits. You can log in with this.">
            <input className="input" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={f.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Username (optional)" hint="3–20 letters, digits or underscore">
            <input className="input" autoCapitalize="none" maxLength={20} value={f.username} onChange={(e) => set("username", e.target.value)} />
          </Field>
          <div className="card p-4">
            <p className="mb-3 text-center font-medium">{pinStage === "set" ? "Choose a 4 or 6 digit PIN" : "Enter the PIN again"}</p>
            {pinStage === "set" ? (
              <PinPad value={f.pin} onChange={(v) => set("pin", v)} />
            ) : (
              <PinPad value={f.pin2} onChange={(v) => set("pin2", v)} max={f.pin.length} slots={f.pin.length} />
            )}
            {pinStage === "set" ? (
              <button type="button" className="btn-ghost mt-4 w-full" disabled={f.pin.length !== 4 && f.pin.length !== 6} onClick={() => setPinStage("confirm")}>Confirm PIN</button>
            ) : (
              <button type="button" className="btn-ghost mt-4 w-full" onClick={() => { set("pin2", ""); setPinStage("set"); set("pin", ""); }}>Change PIN</button>
            )}
          </div>
          <button className="btn-primary" disabled={pinStage === "set" || f.pin2.length !== f.pin.length} onClick={next}>Continue</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">Optional. Helps the coaches know you better. You can skip this.</p>
          <Field label="Email"><input type="email" className="input" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Date of birth"><input type="date" className="input" value={f.dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("dob", e.target.value)} /></Field>
          <Chips label="Playing role" opts={ROLES} value={f.playingRole} onChange={(v) => set("playingRole", v)} />
          <Chips label="Skill level" opts={LEVELS} value={f.skillLevel} onChange={(v) => set("skillLevel", v)} />
          <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create account"}</button>
          <button className="btn-ghost" disabled={busy} onClick={submit}>Skip &amp; finish</button>
        </div>
      )}
    </div>
  );
}

function Chips({ label, opts, value, onChange }: { label: string; opts: string[][]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {opts.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(value === v ? "" : v)} className={cn("rounded-full border px-3.5 py-2 text-sm font-medium", value === v ? "border-pitch bg-pitch text-white" : "border-slate-300 dark:border-white/20")}>{l}</button>
        ))}
      </div>
    </div>
  );
}
