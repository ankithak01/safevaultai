import { createFileRoute, Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { useState } from "react";
import { useDocuments } from "@/hooks/use-vault";
import { daysUntil, formatDate, humanDays } from "@/lib/docs";
import { DocIcon, StatusBadge } from "@/components/DocBits";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/reminders")({
  head: () => ({ meta: [{ title: "Expiry & Reminders — SafeVault" }, { name: "description", content: "Track important document deadlines." }] }),
  component: Reminders,
});

function Reminders() {
  const { data: docs = [] } = useDocuments();
  const [tab, setTab] = useState<"up" | "exp" | "all">("up");
  const withExp = docs.filter((d) => d.expiry_date).map((d) => ({ d, days: daysUntil(d.expiry_date)! })).sort((a, b) => a.days - b.days);
  const groups = { up: withExp.filter((x) => x.days >= 0), exp: withExp.filter((x) => x.days < 0), all: withExp };
  const rows = groups[tab];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Expiry & Reminders" sub="Keep track of important dates and never miss a deadline."
        action={<Link to="/settings" className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-medium"><Settings2 className="h-4 w-4" />Reminder Settings</Link>} />
      <div className="mb-4 flex gap-6 border-b text-sm">
        {([["up", "Upcoming"], ["exp", "Expired"], ["all", "All"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 pb-2 font-medium ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{l} ({groups[k].length})</button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">{["Document", "Type", "Expiry Date", "Days Left", "Status"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nothing here. Add expiry dates when uploading documents.</td></tr> :
              rows.map(({ d, days }) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3"><Link to="/documents/$id" params={{ id: d.id }} className="flex items-center gap-3 font-medium"><DocIcon doc={d} />{d.name}</Link></td>
                  <td className="px-4 py-3 text-muted-foreground">{d.category}</td>
                  <td className="px-4 py-3">{formatDate(d.expiry_date)}</td>
                  <td className="px-4 py-3">{humanDays(days)}</td>
                  <td className="px-4 py-3"><StatusBadge expiry={d.expiry_date} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
