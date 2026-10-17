import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { get, post } from "./api";

export type User = {
  id: number; fullName: string; mobile: string; username: string | null; role: "user" | "admin" | "super_admin";
  email: string | null; dob: string | null; playingRole: string | null; skillLevel: string | null; mustChangePin: boolean;
};
type Ctx = { user: User | null; ready: boolean; refresh: () => Promise<void>; login: (id: string, pin: string) => Promise<User>; logout: () => Promise<void>; setUser: (u: User) => void };
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);
export const isAdmin = (u: User | null) => !!u && (u.role === "admin" || u.role === "super_admin");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try { setUser((await get<{ user: User | null }>("/auth/me")).user); } catch { setUser(null); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const login = async (identifier: string, pin: string) => {
    const r = await post<{ user: User }>("/auth/login", { identifier, pin });
    setUser(r.user);
    return r.user;
  };
  const logout = async () => { await post("/auth/logout"); setUser(null); };
  return <AuthCtx.Provider value={{ user, ready, refresh, login, logout, setUser }}>{children}</AuthCtx.Provider>;
}
