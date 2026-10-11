import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Calendar,
  Download,
  Edit2,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  X,
  Check,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/ai.functions";
import { formatBytes, formatDate, type Doc, CATEGORIES } from "@/lib/docs";
import { Pill, StatusBadge } from "@/components/DocBits";
import { logActivity } from "@/hooks/use-vault";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useVaultKey } from "@/components/VaultKeyProvider";
import { decryptVaultBytes } from "@/lib/vault-crypto";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  head: () => ({
    meta: [
      { title: "Document — SafeVault" },
      { name: "description", content: "View a document and its extracted details." },
    ],
  }),
  component: Viewer,
});

function Viewer() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { key } = useVaultKey();
  const extract = useServerFn(extractDocument);

  const [zoom, setZoom] = useState(100);
  const [tab, setTab] = useState<"info" | "meta">("info");
  const [busy, setBusy] = useState(false);

  // Expiry date editing
  const [isEditingExpiry, setIsEditingExpiry] = useState(false);
  const [expiryInput, setExpiryInput] = useState("");
  const [isSavingExpiry, setIsSavingExpiry] = useState(false);

  // Metadata editing
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  // Delete modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Decrypted blob URL for encrypted docs
  const [decryptedPreviewUrl, setDecryptedPreviewUrl] = useState<string | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Doc | null;
    },
  });

  const { data: rawSignedUrl } = useQuery({
    queryKey: ["doc-url", doc?.storage_path],
    enabled: !!doc && !doc.file_nonce,
    queryFn: async () =>
      (await supabase.storage.from("documents").createSignedUrl(doc!.storage_path, 3600)).data
        ?.signedUrl ?? null,
  });

  // If document was encrypted client-side with a nonce, download and decrypt in browser
  useEffect(() => {
    let active = true;
    if (doc?.file_nonce && key && doc.storage_path) {
      supabase.storage
        .from("documents")
        .download(doc.storage_path)
        .then(async ({ data, error }) => {
          if (!active) return;
          if (error || !data) {
            console.error("Failed to download encrypted doc", error);
            return;
          }
          try {
            const buf = await data.arrayBuffer();
            const decrypted = await decryptVaultBytes(
              key,
              buf,
              doc.file_nonce!,
              doc.mime_type || "application/pdf",
            );
            const objectUrl = URL.createObjectURL(decrypted);
            setDecryptedPreviewUrl(objectUrl);
          } catch (e) {
            console.error("Failed to decrypt document", e);
          }
        });
    }

    return () => {
      active = false;
      if (decryptedPreviewUrl) URL.revokeObjectURL(decryptedPreviewUrl);
    };
  }, [doc?.id, doc?.file_nonce, doc?.storage_path, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (doc) {
      logActivity("Document viewed", doc.name);
      setExpiryInput(doc.expiry_date || "");
      setNameInput(doc.name);
      setCategoryInput(doc.category);
    }
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading)
    return <p className="text-sm text-muted-foreground p-8 text-center">Loading document…</p>;
  if (!doc)
    return (
      <div className="card p-10 text-center">
        Document not found.{" "}
        <Link to="/documents" className="text-primary hover:underline">
          Back to documents
        </Link>
      </div>
    );

  const previewUrl = decryptedPreviewUrl || rawSignedUrl;
  const ex = (doc.extracted ?? {}) as { document_type?: string; fields?: Record<string, string> };
  const isImg = doc.mime_type?.startsWith("image/");

  async function reprocess() {
    setBusy(true);
    try {
      await extract({ data: { id } });
      toast.success("Document re-analyzed");
      await qc.invalidateQueries({ queryKey: ["document", id] });
      await qc.invalidateQueries({ queryKey: ["documents"] });
    } catch {
      toast.error("Could not analyse document");
    } finally {
      setBusy(false);
    }
  }

  async function saveExpiryDate(newExpiry: string | null) {
    setIsSavingExpiry(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          expiry_date: newExpiry || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc!.id);

      if (error) throw error;
      toast.success(newExpiry ? "Expiry date updated" : "Expiry date cleared");
      setIsEditingExpiry(false);
      await qc.invalidateQueries({ queryKey: ["document", id] });
      await qc.invalidateQueries({ queryKey: ["documents"] });
      await logActivity(
        newExpiry ? "Updated document expiry date" : "Cleared document expiry date",
        doc!.name,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update expiry date");
    } finally {
      setIsSavingExpiry(false);
    }
  }

  async function saveMetadata() {
    setIsSavingMeta(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          name: nameInput.trim() || doc!.name,
          category: categoryInput || doc!.category,
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc!.id);

      if (error) throw error;
      toast.success("Metadata updated");
      setIsEditingMeta(false);
      await qc.invalidateQueries({ queryKey: ["document", id] });
      await qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update metadata");
    } finally {
      setIsSavingMeta(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await supabase.storage.from("documents").remove([doc!.storage_path]);
      const { error } = await supabase.from("documents").delete().eq("id", doc!.id);
      if (error) throw error;
      await logActivity("Document deleted", doc!.name);
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/documents" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete document");
      setIsDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/documents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Documents
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
          className="text-destructive hover:bg-destructive/10 gap-1.5"
        >
          <Trash2 className="h-4 w-4" /> Delete Document
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Document Preview Box */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Lock className="h-4 w-4 text-primary" />
            <p className="flex-1 truncate text-sm font-semibold">{doc.name}</p>
            {isImg && (
              <div className="flex items-center gap-1 rounded-lg border text-xs">
                <button
                  onClick={() => setZoom(Math.max(50, zoom - 10))}
                  className="p-1.5"
                  aria-label="Zoom out"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-10 text-center">{zoom}%</span>
                <button
                  onClick={() => setZoom(Math.min(200, zoom + 10))}
                  className="p-1.5"
                  aria-label="Zoom in"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}
            {previewUrl && (
              <a
                href={previewUrl}
                download={doc.name}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1.5 hover:bg-muted"
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
          </div>

          <div className="flex min-h-[480px] items-center justify-center overflow-auto bg-muted/40 p-4">
            {!previewUrl ? (
              <p className="text-sm text-muted-foreground">Loading preview…</p>
            ) : isImg ? (
              <img
                src={previewUrl}
                alt={doc.name}
                style={{ width: `${zoom}%` }}
                className="max-w-none rounded shadow"
              />
            ) : doc.mime_type === "application/pdf" ? (
              <iframe
                src={previewUrl}
                title={doc.name}
                className="h-[600px] w-full rounded bg-card border"
              />
            ) : (
              <a
                href={previewUrl}
                download={doc.name}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                Download / Open file
              </a>
            )}
          </div>
        </div>

        {/* Metadata & Details Card */}
        <div className="card p-5 space-y-4">
          <div className="flex gap-4 border-b text-sm">
            {(["info", "meta"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "info" ? "Extracted Information" : "Metadata & Settings"}
              </button>
            ))}
          </div>

          {tab === "info" ? (
            <div className="space-y-4">
              {doc.status === "processing" && <Pill tone="info">Processing with AI…</Pill>}

              <Row
                label="Document Type"
                value={ex.document_type ?? doc.category}
                badge={ex.document_type ? <Pill tone="ok">Verified</Pill> : null}
              />

              {/* Dynamic Expiry Date Section */}
              <div className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Expiry Date</span>
                  </div>
                  {!isEditingExpiry && (
                    <button
                      onClick={() => {
                        setExpiryInput(doc.expiry_date || "");
                        setIsEditingExpiry(true);
                      }}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Edit2 className="h-3 w-3" />
                      {doc.expiry_date ? "Change" : "Add Expiry Date"}
                    </button>
                  )}
                </div>

                {isEditingExpiry ? (
                  <div className="mt-2 space-y-2 rounded-lg bg-muted/60 p-3">
                    <input
                      type="date"
                      value={expiryInput}
                      onChange={(e) => setExpiryInput(e.target.value)}
                      className="input text-xs"
                    />
                    <div className="flex items-center justify-end gap-2 text-xs">
                      {doc.expiry_date && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => saveExpiryDate(null)}
                          disabled={isSavingExpiry}
                          className="text-destructive h-7 px-2"
                        >
                          Clear Date
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditingExpiry(false)}
                        className="h-7 px-2"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveExpiryDate(expiryInput || null)}
                        disabled={isSavingExpiry}
                        className="h-7 px-2.5"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {doc.expiry_date ? formatDate(doc.expiry_date) : "No expiry date"}
                    </p>
                    {doc.expiry_date && <StatusBadge expiry={doc.expiry_date} />}
                  </div>
                )}
              </div>

              {Object.entries(ex.fields ?? {}).map(([k, v]) => (
                <Row key={k} label={k} value={v} />
              ))}

              {doc.summary && (
                <div className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground block mb-1">AI Summary:</span>
                  {doc.summary}
                </div>
              )}

              <button
                onClick={reprocess}
                disabled={busy}
                className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
                {busy ? "Analysing…" : "Re-run AI extraction"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {isEditingMeta ? (
                <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Document Name</label>
                    <input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="input text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Category</label>
                    <select
                      value={categoryInput}
                      onChange={(e) => setCategoryInput(e.target.value)}
                      className="input text-xs"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingMeta(false)}
                      className="h-7"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveMetadata}
                      disabled={isSavingMeta}
                      className="h-7"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-xs font-semibold">General Details</span>
                  <button
                    onClick={() => setIsEditingMeta(true)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Edit2 className="h-3 w-3" /> Edit
                  </button>
                </div>
              )}

              <Row label="Category" value={doc.category} />
              <Row label="File Type" value={doc.mime_type ?? "—"} />
              <Row label="Size" value={formatBytes(doc.size_bytes)} />
              <Row label="Uploaded" value={formatDate(doc.created_at)} />
              <Row label="Issue Date" value={formatDate(doc.issue_date)} />
              <Row
                label="Encryption Status"
                value={doc.file_nonce ? "Client-Side AES-256-GCM" : "Server Storage Encryption"}
              />
            </div>
          )}

          <div className="mt-6 flex items-center gap-3 rounded-lg border p-3 bg-card">
            <Lock className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Access Protection</p>
              <p className="text-xs text-muted-foreground">
                Protected by PostgreSQL Row-Level Security & Private Bucket ACL
              </p>
            </div>
            <Pill tone="ok">Verified</Pill>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <DialogTitle>Delete Document</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-foreground">{doc.name}</span>? This removes both the
            stored file and its extracted data.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b pb-3 last:border-0">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
      {badge}
    </div>
  );
}
