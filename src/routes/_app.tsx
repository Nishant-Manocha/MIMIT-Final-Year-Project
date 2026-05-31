import { Link, Outlet, useLocation, useNavigate, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  Brain,
  Route as RouteIcon,
  FileQuestion,
  Sparkles,
  MessageSquare,
  Trophy,
  Settings,
  LogOut,
  Bell,
  Menu,
  X,
  Flame,
  Zap,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/brand/logo";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/courses", label: "Courses", icon: BookOpen },
  { to: "/quizzes", label: "Question Sets", icon: Brain },
  { to: "/planner", label: "Study Planner", icon: RouteIcon },
  { to: "/study-rooms", label: "Study Rooms", icon: Users },
  { to: "/generator", label: "Generate Questions", icon: FileQuestion },
  { to: "/recommendations", label: "For You", icon: Sparkles },
  { to: "/tutor", label: "AI Tutor", icon: MessageSquare },
  { to: "/analytics", label: "Analytics", icon: Trophy },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AppLayout() {
  const { user, loading, logout: clearAuth } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { redirect: location.pathname } });
  }, [user, loading, navigate, location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: api.profile,
  });

  if (loading || !user) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  async function logout() {
    clearAuth();
    toast.success("Signed out");
    navigate({ to: "/" });
  }

  const isFocusedWorkspace =
    location.pathname.startsWith("/quizzes/") || location.pathname.startsWith("/planner");

  if (location.pathname.startsWith("/study-rooms")) {
    return <Outlet />;
  }

  if (isFocusedWorkspace) {
    return (
      <div className="relative min-h-dvh">
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed left-4 top-3 z-[70] grid h-10 w-10 place-items-center rounded-xl border border-border bg-background/85 shadow-lg backdrop-blur-xl transition hover:border-primary/60"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileOpen(false)}
                className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
              />
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-[90] flex w-[min(18rem,calc(100vw-2rem))] flex-col border-r border-border/40 bg-sidebar"
              >
                <div className="flex items-center justify-between px-5 py-5">
                  <Logo />
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md p-1.5 hover:bg-muted"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="flex-1 space-y-1 px-3">
                  {navItems.map((it) => (
                    <NavLink
                      key={it.to}
                      {...it}
                      active={location.pathname === it.to || location.pathname.startsWith(it.to + "/")}
                    />
                  ))}
                </nav>
                <button
                  onClick={logout}
                  className="m-3 flex items-center justify-center gap-2 rounded-lg glass-strong py-2.5 text-sm"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <Outlet />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh overflow-x-hidden">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border/40 bg-sidebar/50 backdrop-blur-xl lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              {...it}
              active={location.pathname === it.to || location.pathname.startsWith(it.to + "/")}
            />
          ))}
        </nav>
        <div className="m-3 rounded-xl glass p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
              {(profile?.display_name ?? user.email ?? "?")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {profile?.display_name ?? "Learner"}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Flame className="h-3 w-3 text-warning" />
                {profile?.streak_days ?? 0}d
                <Zap className="ml-1 h-3 w-3 text-secondary" />
                {profile?.xp ?? 0} XP
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-2rem))] flex-col border-r border-border/40 bg-sidebar lg:hidden"
            >
              <div className="flex items-center justify-between px-5 py-5">
                <Logo />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md p-1.5 hover:bg-muted"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-1 px-3">
                {navItems.map((it) => (
                  <NavLink key={it.to} {...it} active={location.pathname === it.to} />
                ))}
              </nav>
              <button
                onClick={logout}
                className="m-3 flex items-center justify-center gap-2 rounded-lg glass-strong py-2.5 text-sm"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/40 bg-background/60 px-4 py-3 backdrop-blur-xl md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden text-sm text-muted-foreground sm:block">
              {greeting()},{" "}
              <span className="text-foreground font-medium">
                {profile?.display_name ?? "Learner"}
              </span>{" "}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/notifications"
              className="relative rounded-lg p-2 transition hover:bg-muted"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 sm:py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-gradient-primary/15 text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-gradient-primary glow-sm" />
      )}
      <Icon className={`h-4 w-4 ${active ? "text-secondary" : ""}`} />
      {label}
    </Link>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
