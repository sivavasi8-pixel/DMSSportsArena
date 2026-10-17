import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Phone } from "lucide-react";
import { PinPad } from "../components/PinPad";
import { Logo, Sheet } from "../components/ui";
import { isAdmin, useAuth } from "../lib/auth";
import { get } from "../lib/api";

export default function Login() {
  const { user, ready, login } = useAuth();
  const nav = useNavigate();
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState<{ phone: string } | null>(null);

  if (ready && user) return <Navigate to={isAdmin(user) ? "/admin" : "/home"} replace />;

  const submit = async () => {
    if (!id.trim()) return toast.error("Enter your mobile number or username");
    if (pin.length < 4) return toast.error("Enter your PIN");
    setBusy(true);
    try {
      const u = await login(id.trim(), pin);
      nav(isAdmin(u) ? "/admin" : "/home", { replace: true });
    } catch (e: any) {
      toast.error(e.message);
      setPin("");
    } finally { setBusy(false); }
  };

  const openForgot = async () => {
    let phone = "";
    try { phone = (await get("/venue")).venue.contactPhone; } catch { /* show generic text */ }
    setForgot({ phone });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-5 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo className="h-20 w-20 shadow-soft" />
        <div>
          <h1 className="font-heading text-2xl font-bold text-pitch dark:text-turf">DMS Sports Arena</h1>
          <p className="text-sm text-slate-500">Book your cricket nets &amp; bowling machine</p>
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-5">
        <div>
          <label htmlFor="ident" className="label">Mobile number or username</label>
          <input id="ident" className="input" autoComplete="username" inputMode="text" autoCapitalize="none" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. 9876543210" />
        </div>
        <PinPad value={pin} onChange={setPin} onEnter={submit} />
        <button className="btn-primary w-full" disabled={busy || pin.length < 4}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
      <div className="flex items-center justify-between text-sm">
        <button className="font-medium text-slate-600 underline" onClick={openForgot}>Forgot PIN?</button>
        <span>New here? <Link to="/signup" className="font-semibold text-pitch underline dark:text-turf">Sign up</Link></span>
      </div>
      <Sheet open={!!forgot} onClose={() => setForgot(null)} title="Forgot your PIN?">
        <p className="mb-4 text-slate-600 dark:text-slate-300">Please contact the nets. The staff will reset your PIN and give you a temporary one. You'll choose a new PIN when you log in.</p>
        {forgot?.phone && <a href={`tel:${forgot.phone}`} className="btn-primary w-full"><Phone size={18} /> Call {forgot.phone}</a>}
      </Sheet>
    </div>
  );
}
