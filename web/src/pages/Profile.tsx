import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Moon, Sun, KeyRound, LogOut } from "lucide-react";
import { patch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Field } from "../components/ui";
import ChangePin from "./ChangePin";

export default function Profile() {
  const { user, logout, setUser } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ fullName: user!.fullName, email: user!.email ?? "", dob: user!.dob ?? "", playingRole: user!.playingRole ?? "", skillLevel: user!.skillLevel ?? "" });
  const [pinOpen, setPinOpen] = useState(false);
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  const [busy, setBusy] = useState(false);

  if (pinOpen) return <div className="-mx-4 -my-4 bg-cream dark:bg-[#0b1511]"><ChangePin onDone={() => setPinOpen(false)} /></div>;

  const save = async () => {
    setBusy(true);
    try {
      const r = await patch("/auth/profile", { fullName: f.fullName, email: f.email || null, dob: f.dob || null, playingRole: f.playingRole || null, skillLevel: f.skillLevel || null });
      setUser(r.user); toast.success("Profile saved");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const toggle = () => {
    const next = !dark; setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* ignore */ }
  };
  const sel = (k: "playingRole" | "skillLevel", opts: string[]) => (
    <select className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Profile</h1>
      <div className="card flex flex-col gap-4 p-4">
        <p className="text-sm text-slate-500">Mobile {user!.mobile}{user!.username && ` · @${user!.username}`}</p>
        <Field label="Full name"><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Date of birth"><input className="input" type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} /></Field>
        <Field label="Playing role">{sel("playingRole", ["batsman", "bowler", "all-rounder", "keeper"])}</Field>
        <Field label="Skill level">{sel("skillLevel", ["beginner", "intermediate", "advanced"])}</Field>
        <button className="btn-primary" disabled={busy} onClick={save}>Save changes</button>
      </div>
      <button className="card flex items-center gap-3 p-4 text-left" onClick={() => setPinOpen(true)}><KeyRound size={20} /> Change PIN</button>
      <button className="card flex items-center gap-3 p-4 text-left" onClick={toggle}>{dark ? <Sun size={20} /> : <Moon size={20} />} {dark ? "Light mode" : "Dark mode"}</button>
      <button className="card flex items-center gap-3 p-4 text-left text-ball" onClick={async () => { await logout(); nav("/login", { replace: true }); }}><LogOut size={20} /> Log out</button>
    </div>
  );
}
