import { BarChart3, CalendarDays, ClipboardList, Ban, Users as UsersIcon, Wallet, Settings as Cog, MapPin, Settings2, LogOut, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Logo } from "../components/ui";
import Dashboard from "./Dashboard";
import Schedule from "./Schedule";
import Bookings, { Payments } from "./Bookings";
import Blocks from "./Blocks";
import Users from "./Users";
import Setup from "./Setup";
import VenueAdmin from "./VenueAdmin";
import Settings from "./Settings";

const nav = [
  { to: "/admin", end: true, label: "Dashboard", icon: BarChart3 },
  { to: "/admin/schedule", label: "Live Schedule", icon: CalendarDays },
  { to: "/admin/bookings", label: "Bookings", icon: ClipboardList },
  { to: "/admin/blocks", label: "Block slots", icon: Ban },
  { to: "/admin/users", label: "Users", icon: UsersIcon },
  { to: "/admin/payments", label: "Payments", icon: Wallet },
  { to: "/admin/setup", label: "Resources & Pricing", icon: Settings2 },
  { to: "/admin/venue", label: "Venue & Photos", icon: MapPin },
  { to: "/admin/settings", label: "Settings & Audit", icon: Cog },
];

export default function AdminApp() {
  const { logout, user } = useAuth();
  const go = useNavigate();
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const n = !dark; setDark(n); document.documentElement.classList.toggle("dark", n);
    try { localStorage.setItem("theme", n ? "dark" : "light"); } catch { /* ignore */ }
  };
  const link = (compact: boolean) => nav.map(({ to, label, icon: Icon, end }) => (
    <NavLink key={to} to={to} end={end} className={({ isActive }) => cn(compact ? "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium" : "flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium", isActive ? "bg-pitch text-white" : "text-slate-600 hover:bg-black/5 dark:text-slate-300 dark:hover:bg-white/10")}>
      <Icon size={compact ? 16 : 20} />{label}
    </NavLink>
  ));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden flex-col gap-1 border-r border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#12201a] lg:flex">
        <div className="mb-4 flex items-center gap-2"><Logo className="h-10 w-10" /><div><p className="font-heading font-bold leading-tight">DMS Sports Arena</p><p className="text-xs text-slate-500">Admin · {user?.fullName}</p></div></div>
        {link(false)}
        <div className="mt-auto flex flex-col gap-1">
          <NavLink to="/home" className="rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-black/5">Player view</NavLink>
          <button onClick={toggle} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-500 hover:bg-black/5">{dark ? <Sun size={16} /> : <Moon size={16} />}{dark ? "Light mode" : "Dark mode"}</button>
          <button onClick={async () => { await logout(); go("/login", { replace: true }); }} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ball hover:bg-black/5"><LogOut size={16} />Log out</button>
        </div>
      </aside>
      <div>
        <header className="sticky top-0 z-30 bg-pitch text-white lg:hidden">
          <div className="flex items-center gap-2 px-4 py-2.5"><Logo className="h-8 w-8" /><span className="font-heading font-semibold">Admin</span>
            <button onClick={toggle} aria-label="Toggle theme" className="ml-auto p-2">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={async () => { await logout(); go("/login", { replace: true }); }} aria-label="Log out" className="p-2"><LogOut size={18} /></button></div>
          <nav className="flex gap-2 overflow-x-auto bg-cream px-3 py-2 dark:bg-[#0b1511]" aria-label="Admin">{link(true)}</nav>
        </header>
        <main className="mx-auto max-w-6xl p-4 lg:p-6">
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="blocks" element={<Blocks />} />
            <Route path="users" element={<Users />} />
            <Route path="payments" element={<Payments />} />
            <Route path="setup" element={<Setup />} />
            <Route path="venue" element={<VenueAdmin />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
