import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Upload, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useDocuments, logActivity } from "@/hooks/use-vault";
import { CATEGORIES, formatDate, type Doc } from "@/lib/docs";
import { DocIcon, StatusBadge } from "@/components/DocBits";
import { PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/documents/")({
  validateSearch: z.object({ q: z.string().optional() }),
  head: () => ({ meta: [{ title: "My Documents — SafeVault" }, { name: "description", content: "Browse and manage your uploaded documents." }] }),
  component: Documents,
});

function Documents() {
  const { q: initialQ } = Route.useSearch();
  const { data: docs = [], isLoading } = useDocuments();
  const [cat, setCat] = useState<string>("All");
  const [q, setQ] = useState(initialQ ?? "");
  const qc = useQueryClient();

  const filtered = docs.filter((d) =>
    (cat === "All" || d.category === cat) &&
    (!q || (d.name + " " + JSON.stringify(d.extracted)).toLowerCase().includes(q.toLowerCase())),
  );

  async function remove(d: Doc) {
    await supabase.storage.from("documents").remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    await logActivity("Document deleted", d.name);
    toast.success("Document deleted");
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="My Documents" sub="View and manage all your uploaded documents."
        action={<Link to="/upload" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Upload className="h-4 w-4" />Upload Document</Link>} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {["All", ...CATEGORIES].map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${cat === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
            {c} ({c === "All" ? docs.length : docs.filter((d) => d.category === c).length})
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="input pl-9" />
        </div>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted-foreground">No documents found.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <div key={d.id} className="card relative p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <DocIcon doc={d} />
                <DropdownMenu>
                  <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild><Link to="/documents/$id" params={{ id: d.id }}>Open</Link></DropdownMenuItem>
                    <DropdownMenuItem onClick={() => remove(d)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Link to="/documents/$id" params={{ id: d.id }} className="mt-3 block">
                <p className="truncate font-semibold">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.category}</p>
                <p className="mt-2 text-xs text-muted-foreground">Uploaded on {formatDate(d.created_at)}</p>
                <p className="text-xs text-muted-foreground">{d.expiry_date ? `Expires on ${formatDate(d.expiry_date)}` : "No expiry"}</p>
                <div className="mt-3"><StatusBadge expiry={d.expiry_date} processing={d.status === "processing"} /></div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
