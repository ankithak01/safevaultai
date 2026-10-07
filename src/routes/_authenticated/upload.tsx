import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, CloudUpload, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractDocument } from "@/lib/ai.functions";
import { CATEGORIES, formatBytes } from "@/lib/docs";
import { logActivity } from "@/hooks/use-vault";
import { PageHeader } from "@/components/AppShell";
import { DocIcon } from "@/components/DocBits";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Upload Document — SafeVault" }, { name: "description", content: "Upload a document to your secure vault." }] }),
  component: UploadPage,
});

const STEPS = ["Uploading", "Reading document", "Document Classification", "Extracting details", "Ready"];
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx";

function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("Auto");
  const [expiry, setExpiry] = useState("");
  const [step, setStep] = useState(-1);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const extract = useServerFn(extractDocument);
  const navigate = useNavigate();
  const qc = useQueryClient();

  function pick(f?: File | null) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast.error("Max file size is 10MB");
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    try {
      setStep(0);
      const path = `${u.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      setStep(1);
      const { data: doc, error } = await supabase.from("documents").insert({
        user_id: u.user.id, name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size,
        category: category === "Auto" ? "Others" : category, expiry_date: expiry || null,
      }).select().single();
      if (error) throw error;
      setStep(2);
      const t = setTimeout(() => setStep(3), 1500);
      await extract({ data: { id: doc.id } }).catch(() => null);
      clearTimeout(t);
      if (category !== "Auto") await supabase.from("documents").update({ category }).eq("id", doc.id);
      setStep(4);
      await logActivity("Document uploaded", file.name);
      qc.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Document stored securely");
      setTimeout(() => navigate({ to: "/documents/$id", params: { id: doc.id } }), 600);
    } catch (e) {
      toast.error((e as Error).message);
      setStep(-1);
    }
  }

  const progress = step < 0 ? 0 : Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Upload Document" sub="Upload your documents securely. They will be automatically classified and processed using AI." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors ${drag ? "border-primary bg-accent" : "bg-card"}`}>
            <CloudUpload className="h-10 w-10 text-primary" />
            <p className="mt-3 font-medium">Drag & drop your file here</p>
            <p className="text-xs text-muted-foreground">or</p>
            <button onClick={() => input.current?.click()} className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Choose File</button>
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0])} />
            <p className="mt-6 text-xs text-muted-foreground">Supports: PDF, JPG, PNG, DOC, DOCX (Max 10MB)</p>
          </div>
          <div className="card grid gap-4 p-5 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block font-medium">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
                <option>Auto</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm"><span className="mb-1 block font-medium">Expiry date (optional)</span>
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="input" />
            </label>
          </div>
        </div>
        <div className="card h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold">Upload Progress</h2>
          {file ? (
            <>
              <div className="flex items-center gap-3">
                <DocIcon doc={{ mime_type: file.type, category: "Identity" }} />
                <div className="min-w-0"><p className="truncate text-sm font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p></div>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
              <ul className="mt-5 space-y-3">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-2 text-sm">
                    {i < step || step === STEPS.length - 1 ? <CheckCircle2 className="h-4 w-4 text-primary" /> : i === step ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    {s}
                  </li>
                ))}
              </ul>
              <button disabled={step >= 0} onClick={upload} className="mt-6 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {step >= 0 ? "Processing…" : "Upload & process"}
              </button>
            </>
          ) : <p className="text-sm text-muted-foreground">Choose a file to get started.</p>}
        </div>
      </div>
    </div>
  );
}
