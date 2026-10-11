import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Calendar, Check, Edit2, Settings2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDocuments, useSession, logActivity } from "@/hooks/use-vault";
import { daysUntil, formatDate, humanDays, type Doc } from "@/lib/docs";
import { DocIcon, StatusBadge } from "@/components/DocBits";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reminders")({
  head: () => ({
    meta: [
      { title: "Expiry & Reminders — SafeVault" },
      { name: "description", content: "Track important document deadlines." },
    ],
  }),
  component: Reminders,
});

function Reminders() {
  const { data: docs = [] } = useDocuments();
  const { data: session } = useSession();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"urgent" | "up" | "exp" | "all">("urgent");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // User's custom reminder days preference (default 30)
  const reminderThreshold = session?.profile?.reminder_days ?? 30;

  const withExp = docs
    .filter((d) => d.expiry_date)
    .map((d) => ({ d, days: daysUntil(d.expiry_date)! }))
    .sort((a, b) => a.days - b.days);

  const groups = {
    // Urgent: within user's configured reminder_days window and not yet expired
    urgent: withExp.filter((x) => x.days >= 0 && x.days <= reminderThreshold),
    up: withExp.filter((x) => x.days >= 0),
    exp: withExp.filter((x) => x.days < 0),
    all: withExp,
  };

  const rows = groups[tab];

  const handleStartEdit = (d: Doc) => {
    setEditingId(d.id);
    setEditDate(d.expiry_date || "");
  };

  const handleSaveExpiry = async (doc: Doc) => {
    setIsSaving(true);
    try {
      const newExpiry = editDate ? editDate : null;
      const { error } = await supabase
        .from("documents")
        .update({
          expiry_date: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      if (error) throw error;
      toast.success(newExpiry ? "Expiry date updated" : "Expiry date cleared");
      setEditingId(null);
      await qc.invalidateQueries({ queryKey: ["documents"] });
      await logActivity("Updated document expiry date", doc.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update expiry");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Expiry & Reminders"
        sub={`Keep track of deadlines. Your active reminder window is set to ${reminderThreshold} days.`}
        action={
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium hover:bg-muted/50"
          >
            <Settings2 className="h-4 w-4" />
            Reminder Settings
          </Link>
        }
      />

      {groups.urgent.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">
              {groups.urgent.length}{" "}
              {groups.urgent.length === 1 ? "document expires" : "documents expire"} within your
              alert window ({reminderThreshold} days).
            </span>
          </div>
          <button
            onClick={() => setTab("urgent")}
            className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-semibold hover:bg-amber-500/30"
          >
            View Urgent
          </button>
        </div>
      )}

      <div className="flex gap-6 border-b text-sm">
        {(
          [
            ["urgent", `Urgent (≤${reminderThreshold}d)`],
            ["up", "Upcoming"],
            ["exp", "Expired"],
            ["all", "All With Expiry"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 pb-2 font-medium transition-colors ${
              tab === k
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {l} ({groups[k].length})
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              {["Document", "Category", "Expiry Date", "Days Left", "Status", "Actions"].map(
                (h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  {tab === "urgent"
                    ? `No documents expiring within ${reminderThreshold} days.`
                    : tab === "exp"
                      ? "No expired documents."
                      : "No documents with expiry dates found. Add an expiry date when uploading or editing."}
                </td>
              </tr>
            ) : (
              rows.map(({ d, days }) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      to="/documents/$id"
                      params={{ id: d.id }}
                      className="flex items-center gap-3 font-medium hover:text-primary transition-colors"
                    >
                      <DocIcon doc={d} />
                      <span className="truncate max-w-[220px]">{d.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{d.category}</td>
                  <td className="px-4 py-3">
                    {editingId === d.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="input h-8 py-0 px-2 text-xs w-36"
                        />
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleSaveExpiry(d)}
                          disabled={isSaving}
                          title="Save date"
                        >
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>{formatDate(d.expiry_date)}</span>
                        <button
                          onClick={() => handleStartEdit(d)}
                          className="text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100"
                          title="Edit expiry date"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span
                      className={
                        days < 0
                          ? "text-destructive"
                          : days <= reminderThreshold
                            ? "text-amber-500"
                            : "text-muted-foreground"
                      }
                    >
                      {humanDays(days)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge expiry={d.expiry_date} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to="/documents/$id"
                      params={{ id: d.id }}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      View & Manage
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
