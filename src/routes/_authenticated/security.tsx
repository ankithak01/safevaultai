import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, KeyRound, Lock, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({ meta: [{ title: "Security — SafeVault" }, { name: "description", content: "How your vault is protected." }] }),
  component: Security,
});

function ago(s: string) {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} hours ago`;
  return `${Math.round(m / 1440)} days ago`;
}

function Security() {
  const { data: log = [] } = useQuery({
    queryKey: ["activity"],
    queryFn: async () => (await supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(15)).data ?? [],
  });
  const cards = [
    { icon: Lock, t: "Encryption", s: "AES-256", d: "Your files are encrypted at rest and in transit." },
    { icon: KeyRound, t: "Authentication", s: "Verified sign-in", d: "Password or Google account required." },
    { icon: Users, t: "Access Control", s: "Owner-only access", d: "Only you can see your documents." },
  ];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Security" sub="Your data is protected with industry-standard security." />
      <div className="flex items-center gap-4 rounded-xl border border-success/30 bg-success-soft p-5">
        <ShieldCheck className="h-10 w-10 text-success" />
        <div><p className="font-semibold text-success">Your vault is secure</p><p className="text-xs text-muted-foreground">End-to-end protection · private storage · per-user access rules</p></div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.t} className="card p-5">
            <c.icon className="h-5 w-5 text-primary" />
            <p className="mt-3 text-sm font-semibold">{c.t}</p>
            <p className="text-xs text-muted-foreground">{c.s}</p>
            <p className="mt-2 text-xs text-muted-foreground">{c.d}</p>
          </div>
        ))}
      </div>
      <h2 className="mb-3 mt-8 font-semibold">Recent Activity</h2>
      <div className="card divide-y">
        {log.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No activity yet.</p> : log.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-4">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <div><p className="text-sm font-medium">{a.action}{a.detail ? ` (${a.detail})` : ""}</p><p className="text-xs text-muted-foreground">{ago(a.created_at)}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
