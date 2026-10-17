import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, isAdmin, useAuth } from "./lib/auth";
import { Logo, Skeleton } from "./components/ui";
import { PlayerShell } from "./components/PlayerShell";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ChangePin from "./pages/ChangePin";
import Home from "./pages/Home";
import Book from "./pages/Book";
import Confirmation from "./pages/Confirmation";
import MyBookings from "./pages/MyBookings";
import Venue from "./pages/Venue";
import Profile from "./pages/Profile";

const AdminApp = lazy(() => import("./admin/AdminApp"));

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo className="h-20 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

function Guard({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePin) return <ChangePin forced />;
  if (admin && !isAdmin(user)) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function Landing() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  return <Navigate to={!user ? "/login" : isAdmin(user) ? "/admin" : "/home"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-center" richColors closeButton />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route element={<Guard><PlayerShell /></Guard>}>
            <Route path="/home" element={<Home />} />
            <Route path="/book" element={<Book />} />
            <Route path="/confirmation" element={<Confirmation />} />
            <Route path="/bookings" element={<MyBookings />} />
            <Route path="/venue" element={<Venue />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="/admin/*" element={<Guard admin><Suspense fallback={<Splash />}><AdminApp /></Suspense></Guard>} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
