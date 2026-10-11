import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Lock, Minus, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/ai.functions";
import { formatBytes, formatDate, type Doc } from "@/lib/docs";
import { Pill, StatusBadge } from "@/components/DocBits";
import { logActivity } from "@/hooks/use-vault";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  head: () => ({ meta: [{ title: "Document — SafeVault" }, { name: "description", content: "View a document and its extracted details." }] }),
  component: Viewer,
});

function Viewer() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const extract = useServerFn(extractDocument);
  const [zoom, setZoom] = useState(100);
  const [tab, setTab] = useState<"info" | "meta">("info");
  const [busy, setBusy] = useState(false);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Doc | null;
    },
  });
  const { data: url } = useQuery({
    queryKey: ["doc-url", doc?.storage_path],
    enabled: !!doc,
    queryFn: async () => (await supabase.storage.from("documents").createSignedUrl(doc!.storage_path, 3600)).data?.signedUrl ?? null,
  });
  useEffect(() => { if (doc) logActivity("Document viewed", doc.name); }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!doc) return <div className="card p-10 text-center">Document not found. <Link to="/documents" className="text-primary">Back</Link></div>;

  const ex = (doc.extracted ?? {}) as { document_type?: string; fields?: Record<string, string> };
  const isImg = doc.mime_type?.startsWith("image/");

  async function reprocess() {
    setBusy(true);
    await extract({ data: { id } }).catch(() => toast.error("Could not analyse document"));
    await qc.invalidateQueries();
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/documents" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Documents</Link>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <p className="flex-1 truncate text-sm font-semibold">{doc.name}</p>
            {isImg && (
              <div className="flex items-center gap-1 rounded-lg border text-xs">
                <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="p-1.5" aria-label="Zoom out"><Minus className="h-3 w-3" /></button>
                <span className="w-10 text-center">{zoom}%</span>
                <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="p-1.5" aria-label="Zoom in"><Plus className="h-3 w-3" /></button>
              </div>
            )}
            {url && <a href={url} target="_blank" rel="noreferrer" className="rounded p-1.5 hover:bg-muted" aria-label="Download"><Download className="h-4 w-4" /></a>}
          </div>
          <div className="flex min-h-[480px] items-center justify-center overflow-auto bg-muted p-4">
            {!url ? <p className="text-sm text-muted-foreground">Loading preview…</p> :
              isImg ? <img src={url} alt={doc.name} style={{ width: `${zoom}%` }} className="max-w-none rounded shadow" /> :
              doc.mime_type === "application/pdf" ? <iframe src={url} title={doc.name} className="h-[600px] w-full rounded bg-card" /> :
              <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary">Open file</a>}
          </div>
        </div>
        <div className="card p-5">
          <div className="mb-4 flex gap-4 border-b text-sm">
            {(["info", "meta"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 pb-2 font-medium ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
                {t === "info" ? "Extracted Information" : "Metadata"}
              </button>
            ))}
          </div>
          {tab === "info" ? (
            <div className="space-y-4">
              {doc.status === "processing" && <Pill tone="info">Processing…</Pill>}
              <Row label="Document Type" value={ex.document_type ?? doc.category} badge={ex.document_type ? <Pill tone="ok">Verified</Pill> : null} />
              {Object.entries(ex.fields ?? {}).map(([k, v]) => <Row key={k} label={k} value={v} />)}
              {doc.expiry_date && <Row label="Expiry Date" value={formatDate(doc.expiry_date)} badge={<StatusBadge expiry={doc.expiry_date} />} />}
              {doc.summary && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{doc.summary}</p>}
              <button onClick={reprocess} disabled={busy} className="inline-flex items-center gap-2 text-xs font-medium text-primary disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />{busy ? "Analysing…" : "Re-run AI extraction"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <Row label="Category" value={doc.category} />
              <Row label="File type" value={doc.mime_type ?? "—"} />
              <Row label="Size" value={formatBytes(doc.size_bytes)} />
              <Row label="Uploaded" value={formatDate(doc.created_at)} />
              <Row label="Issue date" value={formatDate(doc.issue_date)} />
            </div>
          )}
          <div className="mt-6 flex items-center gap-3 rounded-lg border p-3">
            <Lock className="h-5 w-5 text-primary" />
            <div className="flex-1"><p className="text-sm font-semibold">Security</p><p className="text-xs text-muted-foreground">Stored privately in your vault</p></div>
            <Pill tone="ok">Encrypted</Pill>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b pb-3 last:border-0">
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div>
      {badge}
    </div>
  );
}
