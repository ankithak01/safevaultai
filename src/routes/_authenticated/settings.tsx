import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronRight, Database, HelpCircle, KeyRound, User, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDocuments, useSession } from "@/hooks/use-vault";
import { Avatar, PageHeader } from "@/components/AppShell";
import { formatBytes, STORAGE_LIMIT } from "@/lib/docs";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Profile Settings — SafeVault" }, { name: "description", content: "Manage your account and preferences." }] }),
  component: Settings,
});

function Settings() {
  const { data } = useSession();
  const { data: docs = [] } = useDocuments();
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const p = data?.profile;
  useEffect(() => { setName(p?.full_name ?? ""); setHeadline(p?.headline ?? ""); }, [p?.full_name, p?.headline]);
  const used = docs.reduce((a, d) => a + d.size_bytes, 0);

  async function saveProfile(patch: Record<string, unknown>) {
    if (!data) return;
    const { error } = await supabase.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", data.user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  async function changePw() {
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Password changed");
    setPw(""); setCur("");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile Settings" sub="Manage your account and preferences." />
      <div className="card flex items-center gap-4 p-5">
        <Avatar name={p?.full_name ?? data?.user.email} url={p?.avatar_url} size={56} />
        <div className="flex-1">
          <p className="font-semibold">{p?.full_name}</p>
          <p className="text-xs text-muted-foreground">{data?.user.email}</p>
          {p?.headline && <p className="text-xs text-muted-foreground">{p.headline}</p>}
        </div>
        <button onClick={() => setOpen(open === "acc" ? null : "acc")} className="rounded-lg border px-3 py-1.5 text-xs font-medium">Edit Profile</button>
      </div>
      <div className="card mt-4 divide-y">
        <Item icon={User} label="Account Information" onClick={() => setOpen(open === "acc" ? null : "acc")} open={open === "acc"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            <input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline (e.g. B.Tech CSE)" />
          </div>
          <button onClick={() => saveProfile({ full_name: name, headline })} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save</button>
        </Item>
        <Item icon={KeyRound} label="Change Password" onClick={() => setOpen(open === "pw" ? null : "pw")} open={open === "pw"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" />
            <input type="password" minLength={6} className="input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
          </div>
          <button onClick={changePw} disabled={pw.length < 6} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Update password</button>
        </Item>
        <Item icon={Bell} label="Notification Preferences" onClick={() => setOpen(open === "n" ? null : "n")} open={open === "n"}>
          <div className="flex items-center justify-between text-sm">
            <span>Remind me before documents expire</span>
            <Switch checked={p?.email_reminders ?? true} onCheckedChange={(v) => saveProfile({ email_reminders: v })} />
          </div>
          <label className="mt-3 flex items-center justify-between text-sm">
            <span>Days before expiry</span>
            <select className="input w-28" value={p?.reminder_days ?? 30} onChange={(e) => saveProfile({ reminder_days: Number(e.target.value) })}>
              {[7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
        </Item>
        <div className="flex items-center gap-3 p-4">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-sm">Storage Usage</span>
          <span className="text-xs text-muted-foreground">{formatBytes(used)} / {formatBytes(STORAGE_LIMIT)}</span>
          <div className="h-1.5 w-32 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (used / STORAGE_LIMIT) * 100)}%` }} /></div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-sm">Nominee Access</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Coming Soon</span>
        </div>
        <a href="mailto:support@safevault.app" className="flex items-center gap-3 p-4 hover:bg-muted/50">
          <HelpCircle className="h-4 w-4 text-muted-foreground" /><span className="flex-1 text-sm">Help & Support</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
        </a>
      </div>
    </div>
  );
}

function Item({ icon: Icon, label, onClick, open, children }: { icon: typeof User; label: string; onClick: () => void; open: boolean; children: ReactNode }) {
  return (
    <div>
      <button onClick={onClick} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50">
        <Icon className="h-4 w-4 text-muted-foreground" /><span className="flex-1 text-sm">{label}</span>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
