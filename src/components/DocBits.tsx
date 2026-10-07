import { FileText, FileImage, File } from "lucide-react";
import { expiryState, type Doc } from "@/lib/docs";

export function DocIcon({ doc }: { doc: Pick<Doc, "mime_type" | "category"> }) {
  const tone =
    doc.category === "Identity" ? "bg-danger-soft text-destructive" :
    doc.category === "Insurance" ? "bg-warning-soft text-warning" :
    doc.category === "Financial" ? "bg-success-soft text-success" : "bg-info-soft text-primary";
  const Icon = doc.mime_type?.startsWith("image/") ? FileImage : doc.mime_type === "application/pdf" ? FileText : File;
  return <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></div>;
}

export function StatusBadge({ expiry, processing }: { expiry: string | null; processing?: boolean }) {
  if (processing) return <Pill tone="info">Processing</Pill>;
  const s = expiryState(expiry);
  if (s === "expired") return <Pill tone="danger">Expired</Pill>;
  if (s === "soon") return <Pill tone="warn">Expiring soon</Pill>;
  if (s === "upcoming") return <Pill tone="info">Upcoming</Pill>;
  return <Pill tone="ok">Valid</Pill>;
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "danger" | "info"; children: React.ReactNode }) {
  const cls = { ok: "bg-success-soft text-success", warn: "bg-warning-soft text-warning", danger: "bg-danger-soft text-destructive", info: "bg-info-soft text-primary" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
