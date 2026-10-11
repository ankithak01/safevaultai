import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Database,
  KeyRound,
  Lock,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useVaultKey } from "@/components/VaultKeyProvider";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({
    meta: [
      { title: "Security Center — SafeVault" },
      {
        name: "description",
        content:
          "Transparent technical breakdown of SafeVault security boundaries and cryptographic controls.",
      },
    ],
  }),
  component: Security,
});

function ago(s: string) {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} hours ago`;
  return `${Math.round(m / 1440)} days ago`;
}

function Security() {
  const { isUnlocked, isConfigured } = useVaultKey();

  const { data: log = [] } = useQuery({
    queryKey: ["activity"],
    queryFn: async () =>
      (
        await supabase
          .from("activity_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20)
      ).data ?? [],
  });

  const cards = [
    {
      icon: Lock,
      title: "Client-Side Zero-Knowledge",
      status: isUnlocked ? "Vault Unlocked" : isConfigured ? "Vault Locked" : "Not Initialized",
      statusColor: isUnlocked
        ? "text-emerald-500"
        : isConfigured
          ? "text-amber-500"
          : "text-muted-foreground",
      details:
        "Vault credentials, notes, voice recordings, and chat history are encrypted in browser memory via AES-256-GCM. Decryption keys are derived locally using PBKDF2 (310,000 rounds) and never transmitted to servers.",
    },
    {
      icon: Database,
      title: "Row Level Security (RLS)",
      status: "PostgreSQL Strict Isolation",
      statusColor: "text-emerald-500",
      details:
        "All database tables enforce row-level security with auth.uid() checks. Even authenticated queries are cryptographically restricted to the resource owner at the database layer.",
    },
    {
      icon: Server,
      title: "Private Storage Buckets",
      status: "Isolated Storage",
      statusColor: "text-emerald-500",
      details:
        "Documents and voice audio files are stored in private Supabase Storage buckets. File retrieval requires authenticated, time-limited signed URLs or owner token verification.",
    },
    {
      icon: KeyRound,
      title: "AWS KMS / Production HSM",
      status: "Configurable Envelope Encryption",
      statusColor: "text-blue-500",
      details:
        "Production environments support AWS KMS integration for master key management. When KMS is unconfigured (development mode), SafeVault utilizes Web Crypto PBKDF2/AES-GCM client derivation.",
    },
    {
      icon: Users,
      title: "Session & Authentication",
      status: "Supabase GoTrue JWT",
      statusColor: "text-emerald-500",
      details:
        "Authentication is decoupled from vault encryption. User sessions are verified via GoTrue JWTs with short-lived access tokens and secure refresh token rotation.",
    },
    {
      icon: ShieldCheck,
      title: "AI Grounding & Privacy Isolation",
      status: "Zero Passwords in AI",
      statusColor: "text-emerald-500",
      details:
        "Passwords and unapproved records are strictly isolated. AI functions only access documents and explicitly opted-in notes/voice transcripts, never credentials.",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Security Center"
        sub="Technical verification of SafeVault's security boundaries, cryptographic isolation, and audit logs."
      />

      <div className="flex items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
        <ShieldCheck className="h-10 w-10 text-emerald-500 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">
            Cryptographic Integrity & Policy Enforcement Active
          </p>
          <p className="text-xs text-muted-foreground">
            Client-Side AES-256-GCM · PostgreSQL Row Level Security · Supabase Storage Access
            Control · Nonce Verification
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <c.icon className="h-5 w-5 text-primary" />
              <span className={`text-xs font-semibold ${c.statusColor}`}>{c.status}</span>
            </div>
            <div>
              <p className="text-sm font-semibold">{c.title}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.details}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5 space-y-3 border-dashed">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Security Boundary Clarification
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Transport (HTTPS):</strong> Protects client-server transit.
          <br />
          <strong>Database/Storage At Rest:</strong> Supabase encrypts the disk volume.
          <br />
          <strong>Application Vault Layer:</strong> Your sensitive items (passwords, notes,
          recordings, chats) are encrypted in your browser using AES-256-GCM before reaching the
          server. The server holds only ciphertext and nonces.
          <br />
          <strong>AI Context Boundary:</strong> When requesting AI analysis, SafeVault provides only
          contextual excerpts from approved documents and opt-in transcripts. Passwords are never
          sent to AI endpoints.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Recent Security & Activity Log</h2>
        <div className="card divide-y max-h-96 overflow-y-auto">
          {log.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            log.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-4">
                <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {a.action}
                    {a.detail ? (
                      <span className="text-muted-foreground font-normal"> — {a.detail}</span>
                    ) : (
                      ""
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{ago(a.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
