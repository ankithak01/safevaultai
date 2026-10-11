import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { askVault } from "@/lib/ai.functions";
import { PageHeader } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/ask")({
  head: () => ({ meta: [{ title: "Ask SafeVault AI" }, { name: "description", content: "Ask questions about your documents." }] }),
  component: Ask,
});

type Msg = { role: "user" | "assistant"; content: string; source?: { id: string; name: string } | null; at: string };
const SUGGESTIONS = ["When does my passport expire?", "Show me my insurance details", "Which documents expire this year?", "List my educational qualifications"];

function Ask() {
  const ask = useServerFn(askVault);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const next: Msg[] = [...msgs, { role: "user", content: q, at: now }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const r = await ask({ data: { messages: next.map(({ role, content }) => ({ role, content })) } });
      setMsgs([...next, { role: "assistant", content: r.answer, source: r.source, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Ask SafeVault AI" sub="Get instant, accurate answers from your documents." />
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="relative">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question about your documents..." className="input py-3 pr-12" />
        <button disabled={busy} className="absolute right-2 top-2 rounded-md bg-primary p-1.5 text-primary-foreground" aria-label="Send"><Send className="h-4 w-4" /></button>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">Try asking:</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border bg-card px-3 py-1.5 text-xs hover:bg-muted">{s}</button>)}
      </div>
      <div className="mt-8 space-y-5">
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex flex-col items-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-sm">{m.content}</div>
            <span className="mt-1 text-[10px] text-muted-foreground">{m.at}</span>
          </div>
        ) : (
          <div key={i} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></div>
            <div className="card max-w-[85%] p-4">
              <p className="whitespace-pre-wrap text-sm">{m.content}</p>
              {m.source && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border p-2">
                  <FileText className="h-4 w-4 text-destructive" />
                  <div className="flex-1 text-xs"><p className="text-muted-foreground">Source</p><p className="font-medium">{m.source.name}</p></div>
                  <Link to="/documents/$id" params={{ id: m.source.id }} className="rounded-md border px-2 py-1 text-xs font-medium text-primary">View</Link>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Searching your vault…</div>}
      </div>
    </div>
  );
}
