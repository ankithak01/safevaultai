import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  FileText,
  Loader2,
  Send,
  Sparkles,
  Plus,
  MessageSquare,
  Trash2,
  Clock,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { askVault } from "@/lib/ai.functions";
import { PageHeader } from "@/components/AppShell";
import { VaultGate, useVaultKey } from "@/components/VaultKeyProvider";
import {
  useChatSessions,
  useChatMessages,
  useNotes,
  useVoiceNotes,
  type ChatSessionItem,
} from "@/hooks/use-vault";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/ask")({
  head: () => ({
    meta: [
      { title: "Ask SafeVault AI — Grounded Assistant" },
      {
        name: "description",
        content: "Ask questions grounded in your personal documents and notes.",
      },
    ],
  }),
  component: AskRoute,
});

function AskRoute() {
  return (
    <VaultGate
      title="SafeVault AI Assistant is locked"
      description="Unlock your vault to load your encrypted chat history and ask questions about your personal vault."
    >
      <AskManager />
    </VaultGate>
  );
}

const SUGGESTIONS = [
  "When does my passport expire?",
  "Show me my health insurance policy details",
  "Which documents or policies expire this year?",
  "Summarize my recent personal notes",
];

function AskManager() {
  const { key } = useVaultKey();
  const ask = useServerFn(askVault);

  const {
    data: sessions = [],
    isLoading: loadingSessions,
    create: createSession,
    remove: removeSession,
  } = useChatSessions();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<ChatSessionItem | null>(null);

  // Decrypted eligible knowledge sources
  const { data: notes = [] } = useNotes(key);
  const { data: voiceNotes = [] } = useVoiceNotes(key);

  const optInContext = useMemo(() => {
    const list: { id: string; title: string; type: "note" | "voice_note"; content: string }[] = [];
    for (const n of notes) {
      if (n.ai_indexing_enabled && n.content.trim()) {
        list.push({
          id: n.id,
          title: n.title,
          type: "note",
          content: `${n.title}\n${n.content}`.slice(0, 2000),
        });
      }
    }
    for (const v of voiceNotes) {
      if (v.ai_indexing_enabled && v.transcript?.trim()) {
        list.push({
          id: v.id,
          title: v.title,
          type: "voice_note",
          content: `${v.title}\n${v.transcript}`.slice(0, 2000),
        });
      }
    }
    return list;
  }, [notes, voiceNotes]);

  // Messages for active session
  const {
    data: messages = [],
    append: appendMessage,
    isLoading: loadingMessages,
  } = useChatMessages(activeSessionId, key);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-select first session or create initial session
  useEffect(() => {
    if (!loadingSessions && sessions.length > 0 && !activeSessionId) {
      const first = sessions[0];
      if (first) setActiveSessionId(first.id);
    }
  }, [sessions, activeSessionId, loadingSessions]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function handleNewChat() {
    try {
      const created = await createSession.mutateAsync("New Conversation");
      if (created?.id) {
        setActiveSessionId(created.id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create conversation");
    }
  }

  async function handleSendMessage(textToSend: string) {
    const query = textToSend.trim();
    if (!query || busy) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const title = query.slice(0, 36) + (query.length > 36 ? "…" : "");
        const newSession = await createSession.mutateAsync(title);
        sessionId = newSession.id;
        setActiveSessionId(newSession.id);
      } catch {
        toast.error("Failed to start session");
        return;
      }
    }

    setInputText("");
    setBusy(true);

    try {
      // 1. Save and encrypt user message
      await appendMessage.mutateAsync({
        role: "user",
        content: query,
      });

      // 2. Prepare conversation messages for AI prompt
      const conversationHistory = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: query },
      ];

      // 3. Query SafeVault AI with RAG
      const response = await ask({
        data: {
          messages: conversationHistory,
          optInContext,
        },
      });

      // 4. Save and encrypt assistant message
      await appendMessage.mutateAsync({
        role: "assistant",
        content: response.answer,
        source: response.source,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate AI response");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSession() {
    if (!sessionToDelete) return;
    try {
      await removeSession.mutateAsync(sessionToDelete.id);
      if (activeSessionId === sessionToDelete.id) {
        const remaining = sessions.filter((s) => s.id !== sessionToDelete.id);
        setActiveSessionId(remaining[0]?.id || null);
      }
      toast.success("Conversation deleted");
      setSessionToDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete conversation");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Ask SafeVault AI"
        sub="Your personal knowledge assistant, grounded in your documents and AI-enabled notes."
        action={
          <Button onClick={handleNewChat} className="gap-2 font-semibold">
            <Plus className="h-4 w-4" /> New Chat
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Sessions Sidebar */}
        <div className="card flex flex-col p-4 space-y-3 h-[680px]">
          <div className="flex items-center justify-between border-b pb-3">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Conversations
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleNewChat}
              title="Start new conversation"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto pr-1">
            {loadingSessions ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Loading threads…</p>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                <p>No chat history yet.</p>
                <button
                  onClick={handleNewChat}
                  className="mt-2 text-primary font-medium hover:underline"
                >
                  Start your first conversation
                </button>
              </div>
            ) : (
              sessions.map((s) => {
                const isSelected = s.id === activeSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => setActiveSessionId(s.id)}
                    className={`group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="truncate flex-1 pr-2">{s.title || "Conversation"}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessionToDelete(s);
                      }}
                      className={`rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                        isSelected
                          ? "hover:bg-primary-foreground/20"
                          : "hover:bg-destructive/10 hover:text-destructive"
                      }`}
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t pt-3 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Conversations encrypted at rest</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">AES-256</span>
          </div>
        </div>

        {/* Chat Thread Panel */}
        <div className="card flex flex-col h-[680px] p-5">
          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {loadingMessages && activeSessionId ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Decrypting chat history…
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Ask about your documents & notes</h3>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    SafeVault AI strictly references your verified uploads and eligible notes.
                    Passwords are never accessed or indexed.
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 max-w-lg w-full pt-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSendMessage(s)}
                      className="rounded-xl border bg-card p-3 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex flex-col items-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      {m.content}
                    </div>
                    <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3 max-w-[90%]">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="card space-y-3 p-4 bg-card shadow-sm border">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {m.content}
                      </div>

                      {m.source && (
                        <div className="mt-2 flex items-center gap-2.5 rounded-lg border bg-muted/40 p-2.5 text-xs">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                              Verified Source
                            </p>
                            <p className="truncate font-medium">{m.source.name}</p>
                          </div>
                          {m.source.id && (
                            <Link
                              to="/documents/$id"
                              params={{ id: m.source.id }}
                              className="inline-flex items-center gap-1 rounded-md bg-card border px-2 py-1 text-xs font-semibold text-primary hover:bg-muted"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      )}

                      <span className="block text-[10px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                ),
              )
            )}

            {busy && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="card flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Searching and verifying against your vault…</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="mt-4 border-t pt-4"
          >
            <div className="relative">
              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask SafeVault AI about your documents, expiry dates, or notes..."
                disabled={busy}
                className="input py-3 pl-4 pr-12 text-sm shadow-sm"
              />
              <button
                type="submit"
                disabled={busy || !inputText.trim()}
                className="absolute right-2 top-2 rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Delete Thread Confirmation Dialog */}
      <Dialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <DialogTitle>Delete Conversation</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete this conversation and its encrypted
            messages?
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSessionToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSession}
              disabled={removeSession.isPending}
            >
              {removeSession.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
