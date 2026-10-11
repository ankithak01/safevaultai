import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, CloudUpload, Loader2, ShieldCheck, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/ai.functions";
import { CATEGORIES, formatBytes } from "@/lib/docs";
import { logActivity } from "@/hooks/use-vault";
import { PageHeader } from "@/components/AppShell";
import { DocIcon } from "@/components/DocBits";
import { useVaultKey } from "@/components/VaultKeyProvider";
import { encryptVaultBytes } from "@/lib/vault-crypto";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Upload Document — SafeVault" },
      { name: "description", content: "Upload a document to your secure vault." },
    ],
  }),
  component: UploadPage,
});

const STEPS = [
  "Validating & Encrypting",
  "Storing in Private Vault",
  "Reading Document",
  "Extracting Metadata & OCR",
  "Ready in SafeVault",
];

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const ACCEPT = ALLOWED_EXTENSIONS.join(",");

function UploadPage() {
  const { key, isUnlocked } = useVaultKey();
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("Auto");
  const [expiry, setExpiry] = useState("");
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [step, setStep] = useState(-1);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractDocument);
  const navigate = useNavigate();
  const qc = useQueryClient();

  function pick(incoming?: FileList | File[] | null) {
    if (!incoming || incoming.length === 0) return;
    setErrorMessage(null);

    const validFiles: File[] = [];
    const incomingList = Array.from(incoming);

    for (const f of incomingList) {
      if (f.size <= 0) {
        toast.error(`${f.name}: File is empty (0 bytes)`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name}: Exceeds max file size of 10MB`);
        continue;
      }

      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast.error(`${f.name}: Unsupported file type (${ext}). Supported: PDF, JPG, PNG, WEBP.`);
        continue;
      }

      validFiles.push(f);
    }

    if (validFiles.length > 0) {
      setFiles((prev) => {
        // Prevent exact duplicates
        const existingKeys = new Set(prev.map((p) => `${p.name}-${p.size}-${p.lastModified}`));
        const newUnique = validFiles.filter(
          (f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`),
        );
        return [...prev, ...newUnique];
      });
      setStep(-1);
    }
  }

  function removeFile(index: number) {
    if (isUploading) return;
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setErrorMessage(null);
  }

  function clearAll() {
    if (isUploading) return;
    setFiles([]);
    setErrorMessage(null);
    setStep(-1);
  }

  async function upload() {
    if (files.length === 0 || isUploading) return;
    setErrorMessage(null);
    setIsUploading(true);

    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        throw new Error("Please sign in to upload documents");
      }

      let lastDocId: string | null = null;
      let successCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        setCurrentFileIndex(i);

        // Step 0: Validating & Encrypting
        setStep(0);
        const safeName = file.name.replace(/[^\w.-]/g, "_");
        let storagePath = `${u.user.id}/${crypto.randomUUID()}-${safeName}`;
        let fileNonce: string | null = null;
        let uploadPayload: Blob | File = file;

        // Client-side encryption if vault key is unlocked
        if (isUnlocked && key) {
          const buffer = await file.arrayBuffer();
          const encrypted = await encryptVaultBytes(key, buffer);
          uploadPayload = encrypted.encrypted;
          fileNonce = encrypted.nonce;
          storagePath = `${u.user.id}/${crypto.randomUUID()}-${safeName}.enc`;
        }

        // Step 1: Storing in Private Vault (Storage upload)
        setStep(1);
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(storagePath, uploadPayload, {
            contentType: fileNonce ? "application/octet-stream" : file.type,
            upsert: true,
          });
        if (upErr) throw upErr;

        // Step 2: Reading Document (DB record insertion)
        setStep(2);
        const { data: doc, error: insertError } = await supabase
          .from("documents")
          .insert({
            user_id: u.user.id,
            name: file.name,
            storage_path: storagePath,
            mime_type: file.type,
            size_bytes: file.size,
            category: category === "Auto" ? "Others" : category,
            expiry_date: expiry.trim() ? expiry : null,
            file_nonce: fileNonce,
            status: "processing",
          })
          .select()
          .single();

        if (insertError || !doc) throw insertError || new Error("Failed to create document record");

        lastDocId = doc.id;

        // Step 3: Extracting Metadata & OCR (non-blocking with client timeout)
        setStep(3);
        try {
          const timeoutPromise = new Promise<{ ok: boolean }>((resolve) =>
            setTimeout(() => resolve({ ok: false }), 12000),
          );
          await Promise.race([extract({ data: { id: doc.id } }), timeoutPromise]);
        } catch (err) {
          console.warn("AI extraction notice (non-fatal):", err);
        }

        if (category !== "Auto") {
          await supabase.from("documents").update({ category }).eq("id", doc.id);
        } else {
          // Ensure status is ready
          await supabase.from("documents").update({ status: "ready" }).eq("id", doc.id);
        }

        // Step 4: Ready in SafeVault
        setStep(4);
        await logActivity("Document uploaded", file.name);
        successCount++;
      }

      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["vault-stats"] });

      if (successCount === 1 && lastDocId) {
        toast.success("Document stored securely in your vault");
        setTimeout(() => {
          navigate({ to: "/documents/$id", params: { id: lastDocId } });
        }, 700);
      } else {
        toast.success(`${successCount} documents stored securely in your vault`);
        setTimeout(() => {
          navigate({ to: "/documents" });
        }, 700);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      console.error("Upload error:", e);
      setErrorMessage(msg);
      toast.error(msg);
      setStep(-1);
    } finally {
      setIsUploading(false);
    }
  }

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  // Overall progress considers both batch index and step index
  const stepProgress = step < 0 ? 0 : (step + 1) / STEPS.length;
  const overallProgress =
    files.length === 0
      ? 0
      : Math.round(((currentFileIndex + stepProgress) / files.length) * 100);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Upload Documents"
        sub="Upload one or multiple documents securely. Files are stored in private storage and analyzed with AI."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              drag ? "border-primary bg-accent" : "bg-card"
            }`}
          >
            <CloudUpload className="h-10 w-10 text-primary" />
            <p className="mt-3 font-medium">Drag & drop files here</p>
            <p className="text-xs text-muted-foreground">or</p>
            <button
              onClick={() => input.current?.click()}
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Choose Files
            </button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="mt-6 text-xs text-muted-foreground">
              Supports multiple: PDF, JPG, PNG, WEBP (Max 10MB each)
            </p>
          </div>

          <div className="card grid gap-4 p-5 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input"
              >
                <option>Auto</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>

            <div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Expiry date (optional)</span>
                <input
                  type="date"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="input"
                />
              </label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Leave blank if no expiry (e.g. Degrees, Certificates).
              </p>
            </div>
          </div>

          {isUnlocked && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                Vault is unlocked: your documents will be encrypted on this device with AES-256-GCM
                before storage.
              </span>
            </div>
          )}
        </div>

        {/* Upload Progress & Details Card */}
        <div className="card h-fit p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-semibold">
              Upload Status {files.length > 0 && `(${files.length})`}
            </h2>
            {files.length > 0 && !isUploading && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => input.current?.click()}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  + Add more
                </button>
                <span className="text-muted-foreground text-xs">•</span>
                <button
                  onClick={clearAll}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {files.length > 0 ? (
            <>
              {/* Selected Files List */}
              <div className="max-h-52 overflow-y-auto space-y-2 border-b pb-3 pr-1">
                {files.map((f, idx) => {
                  const isCurrent = isUploading && idx === currentFileIndex;
                  const isDone = isUploading && idx < currentFileIndex;

                  return (
                    <div
                      key={`${f.name}-${idx}`}
                      className={`flex items-center justify-between gap-2 rounded-lg p-2 text-xs transition-colors ${
                        isCurrent
                          ? "bg-primary/10 border border-primary/20"
                          : isDone
                            ? "bg-muted/40 opacity-80"
                            : "bg-muted/20"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : isCurrent ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                        ) : (
                          <DocIcon doc={{ mime_type: f.type, category: "Identity" }} />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{f.name}</p>
                          <p className="text-[11px] text-muted-foreground">{formatBytes(f.size)}</p>
                        </div>
                      </div>
                      {!isUploading && (
                        <button
                          onClick={() => removeFile(idx)}
                          className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
                          aria-label={`Remove ${f.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {isUploading
                    ? `Processing file ${currentFileIndex + 1} of ${files.length}`
                    : `Total size: ${formatBytes(totalBytes)}`}
                </span>
                <span>{overallProgress}%</span>
              </div>

              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>

              {/* Sub-steps of current file */}
              <ul className="mt-4 space-y-2.5">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-2 text-xs">
                    {i < step || (step === STEPS.length - 1 && (!isUploading || currentFileIndex === files.length - 1)) ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : i === step && isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span
                      className={
                        i === step && isUploading ? "font-semibold text-foreground" : "text-muted-foreground"
                      }
                    >
                      {s}
                    </span>
                  </li>
                ))}
              </ul>

              {errorMessage && (
                <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                  <p className="font-semibold">Upload failed</p>
                  <p className="mt-0.5">{errorMessage}</p>
                </div>
              )}

              <button
                disabled={isUploading}
                onClick={upload}
                className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isUploading
                  ? `Processing (${currentFileIndex + 1}/${files.length})…`
                  : errorMessage
                    ? "Retry Upload"
                    : `Encrypt & Store ${files.length === 1 ? "Document" : `${files.length} Documents`}`}
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Choose or drop files to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
