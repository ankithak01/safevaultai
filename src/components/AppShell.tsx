import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Bell, CalendarClock, FileText, LayoutDashboard, LogOut, Settings, ShieldCheck, Sparkles, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-vault";
import { Logo } from "@/components/Logo";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/ask", label: "Ask AI", icon: Sparkles },
  { to: "/reminders", label: "Expiry & Reminders", icon: CalendarClock },
  { to: "/security", label: "Security", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function initials(name?: string | null) {
  return (name ?? "U").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}

export function Avatar({ name, url, size = 32 }: { name?: string | null; url?: string | null; size?: number }) {
  return url ? (
    <img src={url} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="flex items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground" style={{ width: size, height: size, fontSize: size / 2.6 }}>
      {initials(name)}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const name = data?.profile?.full_name ?? data?.user.email;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-5 py-5"><Logo invert /></div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary" }}>
              <n.icon className="h-4 w-4" />{n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-sidebar-border p-4">
          <Avatar name={name} url={data?.profile?.avatar_url} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{data?.profile?.full_name ?? "—"}</p>
            <p className="truncate text-xs opacity-70">{data?.user.email}</p>
          </div>
          <button onClick={signOut} aria-label="Sign out" className="rounded p-1 hover:bg-sidebar-accent"><LogOut className="h-4 w-4" /></button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b bg-card/90 px-6 py-3 backdrop-blur">
          <div className="md:hidden"><Logo /></div>
          <form className="relative hidden max-w-md flex-1 sm:block" onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get("q") as string;
            navigate({ to: "/documents", search: { q } });
          }}>
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input name="q" placeholder="Search documents..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/reminders" className="rounded-full p-2 hover:bg-muted" aria-label="Reminders"><Bell className="h-5 w-5" /></Link>
            <Link to="/settings"><Avatar name={name} url={data?.profile?.avatar_url} /></Link>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs" activeProps={{ className: "bg-primary text-primary-foreground" }}>{n.label}</Link>
          ))}
        </nav>
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
