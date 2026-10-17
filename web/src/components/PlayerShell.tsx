import { CalendarDays, Home, Ticket, User } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "./ui";
import { useAuth, isAdmin } from "../lib/auth";
import { cn } from "../lib/utils";

const tabs = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/book", label: "Book", icon: CalendarDays },
  { to: "/bookings", label: "My Bookings", icon: Ticket },
  { to: "/profile", label: "Profile", icon: User },
];

export function PlayerShell() {
  const { user } = useAuth();
  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-24">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-pitch px-4 py-3 text-white">
        <Logo className="h-9 w-9" />
        <span className="font-heading text-lg font-semibold">DMS Sports Arena</span>
        {isAdmin(user) && <NavLink to="/admin" className="ml-auto rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium">Admin</NavLink>}
      </header>
      <main className="px-4 py-4"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 backdrop-blur dark:bg-[#12201a]/95" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Main">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", isActive ? "text-pitch dark:text-turf" : "text-slate-500")}>
              <Icon size={22} />{label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
