import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Database, FileText, Sparkles } from "lucide-react";
import { useDocuments, useSession } from "@/hooks/use-vault";
import { daysUntil, formatBytes, formatDate, humanDays, MS_DAY, STORAGE_LIMIT } from "@/lib/docs";
import { DocIcon, Pill } from "@/components/DocBits";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SafeVault" }, { name: "description", content: "Overview of your SafeVault documents." }] }),
  component: Dashboard,
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { data: docs = [] } = useDocuments();
  const { data: me } = useSession();
  const used = docs.reduce((a, d) => a + d.size_bytes, 0);
  const weekAgo = Date.now() - 7 * MS_DAY;
  const thisWeek = docs.filter((d) => new Date(d.created_at).getTime() > weekAgo).length;
  const upcoming = docs
    .map((d) => ({ d, days: daysUntil(d.expiry_date) }))
    .filter((x) => x.days !== null && x.days >= 0)
    .sort((a, b) => a.days! - b.days!);
  const soon = upcoming.filter((x) => x.days! <= 30).length;
  const first = me?.profile?.full_name?.split(" ")[0] ?? "there";

  const stats = [
    { icon: FileText, label: "Total Documents", value: docs.length, sub: `+${thisWeek} this week`, tone: "bg-success-soft text-success" },
    { icon: Database, label: "Storage Used", value: formatBytes(used), sub: `of ${formatBytes(STORAGE_LIMIT)}`, tone: "bg-info-soft text-primary" },
    { icon: CalendarClock, label: "Expiring Soon", value: soon, sub: "within 30 days", tone: "bg-warning-soft text-warning" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{greeting()}, {first}! 👋</h1>
        <p className="text-sm text-muted-foreground">Here's what's happening with your documents today.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card flex gap-4 p-5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.tone}`}><s.icon className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-primary p-6 text-primary-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/15"><Sparkles className="h-6 w-6" /></div>
        <div className="flex-1">
          <p className="text-lg font-semibold">Ask SafeVault AI</p>
          <p className="text-sm opacity-80">Get instant answers from your documents</p>
        </div>
        <Link to="/ask" className="inline-flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm font-semibold text-primary">Ask Now <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <Head title="Recent Documents" to="/documents" />
          {docs.length === 0 ? <Empty /> : docs.slice(0, 4).map((d) => (
            <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
              <DocIcon doc={d} />
              <div className="min-w-0"><p className="truncate text-sm font-medium">{d.name}</p><p className="text-xs text-muted-foreground">{d.category} · {formatDate(d.created_at)}</p></div>
            </Link>
          ))}
        </div>
        <div className="card p-5">
          <Head title="Upcoming Expirations" to="/reminders" />
          {upcoming.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No upcoming expirations.</p> : upcoming.slice(0, 4).map(({ d, days }) => (
            <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
              <DocIcon doc={d} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{d.name}</p><p className="text-xs text-muted-foreground">{formatDate(d.expiry_date)}</p></div>
              <Pill tone={days! <= 30 ? "danger" : "warn"}>in {humanDays(days)}</Pill>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Head({ title, to }: { title: string; to: "/documents" | "/reminders" }) {
  return <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{title}</h2><Link to={to} className="text-xs font-medium text-primary">View all →</Link></div>;
}

function Empty() {
  return <div className="py-6 text-center text-sm text-muted-foreground">No documents yet. <Link to="/upload" className="font-medium text-primary">Upload your first</Link></div>;
}
