import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  Database,
  Download,
  HelpCircle,
  KeyRound,
  Lock,
  ShieldAlert,
  Trash2,
  Unlock,
  User,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDocuments, useSession, useVaultStats, logActivity } from "@/hooks/use-vault";
import { useVaultKey } from "@/components/VaultKeyProvider";
import { Avatar, PageHeader } from "@/components/AppShell";
import { formatBytes, STORAGE_LIMIT } from "@/lib/docs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SafeVault" },
      {
        name: "description",
        content: "Manage your account, vault security, storage, and preferences.",
      },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { data: session } = useSession();
  const { data: docs = [] } = useDocuments();
  const { data: stats } = useVaultStats();
  const { isUnlocked, isConfigured, lock, setup } = useVaultKey();
  const qc = useQueryClient();

  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");

  // Vault Passphrase Reset state
  const [newVaultPassphrase, setNewVaultPassphrase] = useState("");
  const [isResettingVault, setIsResettingVault] = useState(false);

  // Export & Delete Account Dialogs
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const p = session?.profile;

  useEffect(() => {
    setName(p?.full_name ?? "");
    setHeadline(p?.headline ?? "");
  }, [p?.full_name, p?.headline]);

  const usedDocs = stats?.docBytes ?? docs.reduce((a, d) => a + d.size_bytes, 0);
  const usedVoice = stats?.voiceBytes ?? 0;
  const totalUsed = usedDocs + usedVoice;

  async function saveProfile(patch: Record<string, unknown>) {
    if (!session) return;
    const { error } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", session.user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated");
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  async function changePw() {
    const { error } = await supabase.auth.updateUser({
      password: pw,
      current_password: cur,
    } as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account password changed");
    setPw("");
    setCur("");
    setOpen(null);
  }

  async function handleResetVaultPassphrase() {
    if (newVaultPassphrase.length < 12) {
      toast.error("Passphrase must be at least 12 characters");
      return;
    }
    setIsResettingVault(true);
    try {
      await setup(newVaultPassphrase);
      toast.success("Vault passphrase updated successfully!");
      setNewVaultPassphrase("");
      setOpen(null);
      await logActivity("Updated vault encryption passphrase", "Settings");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset passphrase");
    } finally {
      setIsResettingVault(false);
    }
  }

  async function handleExportData() {
    setIsExporting(true);
    try {
      // Fetch metadata of documents, notes count, passwords count, voice notes
      const [docsRes, passRes, notesRes, voiceRes] = await Promise.all([
        supabase
          .from("documents")
          .select("id, name, category, size_bytes, expiry_date, created_at"),
        supabase.from("password_entries").select("id, category, favorite, created_at"),
        supabase.from("notes").select("id, category, favorite, ai_indexing_enabled, created_at"),
        supabase.from("voice_notes").select("id, title, size_bytes, duration_seconds, created_at"),
      ]);

      const exportPayload = {
        exported_at: new Date().toISOString(),
        user_id: session?.user.id,
        user_email: session?.user.email,
        summary: {
          documents_count: docsRes.data?.length ?? 0,
          passwords_count: passRes.data?.length ?? 0,
          notes_count: notesRes.data?.length ?? 0,
          voice_notes_count: voiceRes.data?.length ?? 0,
        },
        documents: docsRes.data ?? [],
        notes_metadata: notesRes.data ?? [],
        passwords_metadata: passRes.data ?? [],
        voice_notes_metadata: voiceRes.data ?? [],
        security_note:
          "Confidential SafeVault JSON Export. Client-side encrypted payloads remain secure.",
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `safevault-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("SafeVault data export downloaded");
      await logActivity("Exported account data archive", "Settings");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export data");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }
    setIsDeletingAccount(true);
    try {
      // Remove all user records
      if (session?.user.id) {
        await Promise.all([
          supabase.from("documents").delete().eq("user_id", session.user.id),
          supabase.from("password_entries").delete().eq("user_id", session.user.id),
          supabase.from("notes").delete().eq("user_id", session.user.id),
          supabase.from("voice_notes").delete().eq("user_id", session.user.id),
          supabase.from("chat_sessions").delete().eq("user_id", session.user.id),
          supabase.from("activity_log").delete().eq("user_id", session.user.id),
        ]);
      }
      await supabase.auth.signOut();
      toast.success("Account data cleared and signed out");
      window.location.href = "/login";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete account");
      setIsDeletingAccount(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Profile Settings"
        sub="Manage your account, vault cryptography, and preferences."
      />

      {/* Profile Card */}
      <div className="card flex items-center gap-4 p-5">
        <Avatar name={p?.full_name ?? session?.user.email} url={p?.avatar_url} size={56} />
        <div className="flex-1">
          <p className="font-semibold">{p?.full_name || "SafeVault User"}</p>
          <p className="text-xs text-muted-foreground">{session?.user.email}</p>
          {p?.headline && <p className="text-xs text-muted-foreground">{p.headline}</p>}
        </div>
        <button
          onClick={() => setOpen(open === "acc" ? null : "acc")}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted/50"
        >
          Edit Profile
        </button>
      </div>

      {/* Collapsible Settings Sections */}
      <div className="card divide-y">
        {/* Account Info */}
        <Item
          icon={User}
          label="Account Information"
          onClick={() => setOpen(open === "acc" ? null : "acc")}
          open={open === "acc"}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
            <input
              className="input"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Headline (e.g. Software Engineer)"
            />
          </div>
          <button
            onClick={() => saveProfile({ full_name: name, headline })}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Save Profile
          </button>
        </Item>

        {/* Change Account Auth Password */}
        <Item
          icon={KeyRound}
          label="Change Login Password"
          onClick={() => setOpen(open === "pw" ? null : "pw")}
          open={open === "pw"}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="password"
              className="input"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              placeholder="Current password"
            />
            <input
              type="password"
              minLength={6}
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="New password"
            />
          </div>
          <button
            onClick={changePw}
            disabled={pw.length < 6}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Update Login Password
          </button>
        </Item>

        {/* Vault Encryption Keys & Passphrase */}
        <Item
          icon={Lock}
          label="Vault Encryption & Security"
          onClick={() => setOpen(open === "vault" ? null : "vault")}
          open={open === "vault"}
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
              <div>
                <p className="font-medium">Vault Lock Status</p>
                <p className="text-xs text-muted-foreground">
                  {isUnlocked
                    ? "Unlocked in memory with AES-256-GCM key."
                    : "Locked. Encryption key is not held."}
                </p>
              </div>
              {isUnlocked ? (
                <Button size="sm" variant="outline" onClick={lock} className="gap-1.5 text-xs">
                  <Lock className="h-3.5 w-3.5" /> Lock Vault Now
                </Button>
              ) : (
                <span className="text-xs font-semibold text-amber-500">Locked</span>
              )}
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="font-medium">Update Vault Passphrase</p>
              <p className="text-xs text-muted-foreground">
                Set or update your zero-knowledge master passphrase (minimum 12 characters).
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  minLength={12}
                  className="input flex-1"
                  placeholder="New vault passphrase (12+ chars)"
                  value={newVaultPassphrase}
                  onChange={(e) => setNewVaultPassphrase(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={newVaultPassphrase.length < 12 || isResettingVault}
                  onClick={handleResetVaultPassphrase}
                >
                  {isResettingVault ? "Updating..." : "Update Passphrase"}
                </Button>
              </div>
            </div>
          </div>
        </Item>

        {/* Notification Preferences */}
        <Item
          icon={Bell}
          label="Notification & Reminders"
          onClick={() => setOpen(open === "n" ? null : "n")}
          open={open === "n"}
        >
          <div className="flex items-center justify-between text-sm">
            <span>Alert before documents expire</span>
            <Switch
              checked={p?.email_reminders ?? true}
              onCheckedChange={(v) => saveProfile({ email_reminders: v })}
            />
          </div>
          <label className="mt-3 flex items-center justify-between text-sm">
            <span>Reminder alert window</span>
            <select
              className="input w-28"
              value={p?.reminder_days ?? 30}
              onChange={(e) => saveProfile({ reminder_days: Number(e.target.value) })}
            >
              {[7, 15, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
        </Item>

        {/* Storage Breakdown */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">Storage Usage</span>
            <span className="text-xs text-muted-foreground">
              {formatBytes(totalUsed)} / {formatBytes(STORAGE_LIMIT)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.max(1, (usedDocs / STORAGE_LIMIT) * 100)}%` }}
              title={`Documents: ${formatBytes(usedDocs)}`}
            />
            <div
              className="h-full bg-indigo-500"
              style={{ width: `${Math.max(0, (usedVoice / STORAGE_LIMIT) * 100)}%` }}
              title={`Voice Notes: ${formatBytes(usedVoice)}`}
            />
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" /> Documents:{" "}
              {formatBytes(usedDocs)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500" /> Voice Notes:{" "}
              {formatBytes(usedVoice)}
            </span>
          </div>
        </div>

        {/* Export Data */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Download className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Export Vault Data</p>
              <p className="text-xs text-muted-foreground">
                Download a secure JSON archive of your metadata and vault summaries.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportData}
            disabled={isExporting}
            className="text-xs"
          >
            {isExporting ? "Exporting..." : "Export JSON"}
          </Button>
        </div>

        {/* Nominee Access (Coming Soon) */}
        <div className="flex items-center gap-3 p-4">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-sm">Nominee Access</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Coming Soon
          </span>
        </div>

        {/* Danger Zone: Delete Account */}
        <div className="flex items-center justify-between p-4 bg-destructive/5">
          <div className="flex items-center gap-3">
            <Trash2 className="h-4 w-4 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Delete Vault Account</p>
              <p className="text-xs text-muted-foreground">
                Permanently wipe all documents, passwords, notes, and records.
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteAccountModal(true)}
            className="text-xs"
          >
            Delete Account
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteAccountModal} onOpenChange={setShowDeleteAccountModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Delete SafeVault Account
            </DialogTitle>
            <DialogDescription>
              This action is permanent and irreversible. All your stored documents, passwords,
              notes, recordings, and activity logs will be wiped immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <label className="text-xs text-muted-foreground">
              Type <strong className="text-foreground">DELETE</strong> to confirm:
            </label>
            <input
              className="input text-sm"
              placeholder="Type DELETE"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteAccountModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "DELETE" || isDeletingAccount}
              onClick={handleDeleteAccount}
            >
              {isDeletingAccount ? "Deleting..." : "Permanently Wipe Everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Item({
  icon: Icon,
  label,
  onClick,
  open,
  children,
}: {
  icon: typeof User;
  label: string;
  onClick: () => void;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50"
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm">{label}</span>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
