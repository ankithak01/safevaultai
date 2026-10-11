import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus,
  Search,
  Star,
  Trash2,
  StickyNote,
  Sparkles,
  Tag,
  Check,
  Loader2,
  ShieldAlert,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { VaultGate, useVaultKey } from "@/components/VaultKeyProvider";
import { useNotes, type NoteItem, type DecryptedNote } from "@/hooks/use-vault";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Notes Vault — SafeVault" },
      { name: "description", content: "Client-side encrypted personal notes and thoughts." },
    ],
  }),
  component: NotesRoute,
});

const NOTE_CATEGORIES = ["All", "General", "Personal", "Work", "Finance", "Ideas"] as const;

function NotesRoute() {
  return (
    <VaultGate
      title="Notes Vault is locked"
      description="Enter your vault passphrase to decrypt and read your private notes."
    >
      <NotesManager />
    </VaultGate>
  );
}

function NotesManager() {
  const { key } = useVaultKey();
  const {
    data: items = [],
    isLoading,
    create,
    update,
    remove,
    toggleFavorite,
    toggleAiIndex,
  } = useNotes(key);

  const [category, setCategory] = useState<string>("All");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<NoteItem | null>(null);

  // Active note editor state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("General");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editFavorite, setEditFavorite] = useState(false);
  const [editAiIndex, setEditAiIndex] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  // Autosave status: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedVersionRef = useRef<string>("");

  // Gather all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const item of items) {
      for (const t of item.tags || []) {
        if (t.trim()) tags.add(t.trim().toLowerCase());
      }
    }
    return Array.from(tags).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (favoritesOnly && !item.favorite) return false;
      if (selectedTag && !item.tags?.map((t) => t.toLowerCase()).includes(selectedTag))
        return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(query);
        const matchesContent = item.content?.toLowerCase().includes(query);
        const matchesTags = item.tags?.some((t) => t.toLowerCase().includes(query));
        if (!matchesTitle && !matchesContent && !matchesTags) return false;
      }
      return true;
    });
  }, [items, category, favoritesOnly, selectedTag, search]);

  const activeNote = useMemo(() => {
    return items.find((i) => i.id === activeNoteId) || null;
  }, [items, activeNoteId]);

  // When selecting a note, populate editor
  useEffect(() => {
    if (activeNote) {
      setEditTitle(activeNote.title);
      setEditContent(activeNote.content);
      setEditCategory(activeNote.category || "General");
      setEditTags(activeNote.tags || []);
      setEditFavorite(activeNote.favorite);
      setEditAiIndex(activeNote.ai_indexing_enabled);
      setSaveStatus("idle");
      lastSavedVersionRef.current = JSON.stringify({
        title: activeNote.title,
        content: activeNote.content,
        category: activeNote.category || "General",
        tags: activeNote.tags || [],
        favorite: activeNote.favorite,
        ai_indexing_enabled: activeNote.ai_indexing_enabled,
      });
    }
  }, [activeNoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autosave
  useEffect(() => {
    if (!activeNote) return;

    const currentVersion = JSON.stringify({
      title: editTitle,
      content: editContent,
      category: editCategory,
      tags: editTags,
      favorite: editFavorite,
      ai_indexing_enabled: editAiIndex,
    });

    if (currentVersion === lastSavedVersionRef.current) {
      return;
    }

    setSaveStatus("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const payload: DecryptedNote = {
          title: editTitle.trim() || "Untitled Note",
          content: editContent,
          category: editCategory,
          tags: editTags,
        };
        await update.mutateAsync({
          id: activeNote.id,
          payload,
          favorite: editFavorite,
          ai_indexing_enabled: editAiIndex,
        });
        lastSavedVersionRef.current = currentVersion;
        setSaveStatus("saved");
      } catch (e) {
        console.error("Autosave error", e);
        setSaveStatus("error");
      }
    }, 800);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [editTitle, editContent, editCategory, editTags, editFavorite, editAiIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateNew() {
    try {
      const created = await create.mutateAsync({
        title: "Untitled Note",
        content: "",
        category: category !== "All" ? category : "General",
        tags: selectedTag ? [selectedTag] : [],
        favorite: false,
        ai_indexing_enabled: false,
      });
      if (created?.id) {
        setActiveNoteId(created.id);
      }
      toast.success("New note created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create note");
    }
  }

  function handleAddTag() {
    const trimmed = newTagInput.trim().toLowerCase();
    if (trimmed && !editTags.includes(trimmed)) {
      setEditTags([...editTags, trimmed]);
      setNewTagInput("");
    }
  }

  function handleRemoveTag(tagToRemove: string) {
    setEditTags(editTags.filter((t) => t !== tagToRemove));
  }

  async function handleDeleteNote() {
    if (!deleteCandidate) return;
    try {
      await remove.mutateAsync({ id: deleteCandidate.id, title: deleteCandidate.title });
      if (activeNoteId === deleteCandidate.id) {
        setActiveNoteId(null);
      }
      toast.success("Note deleted");
      setDeleteCandidate(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete note");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Notes Vault"
        sub="Private markdown notes encrypted at rest. AI search indexing is opt-in per note."
        action={
          <Button onClick={handleCreateNew} className="gap-2 font-semibold shadow-sm">
            <Plus className="h-4 w-4" /> New Note
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Left column: Filters and Note List */}
        <div className={`space-y-4 ${activeNoteId ? "hidden lg:block" : "block"}`}>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes & content..."
              className="input pl-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {NOTE_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  category === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-muted"
                }`}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                favoritesOnly
                  ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-card hover:bg-muted"
              }`}
            >
              <Star className={`h-3 w-3 ${favoritesOnly ? "fill-amber-500 text-amber-500" : ""}`} />
              Starred
            </button>
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium flex items-center gap-1 mr-1">
                <Tag className="h-3 w-3" /> Tags:
              </span>
              {selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-primary"
                >
                  Clear ({selectedTag}) ✕
                </button>
              )}
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTag(selectedTag === t ? null : t)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    selectedTag === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:bg-muted"
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="card p-8 text-center text-sm text-muted-foreground">
              Decrypting notes…
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted-foreground space-y-2">
              <p>No notes found.</p>
              <Button variant="outline" size="sm" onClick={handleCreateNew}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Create a note
              </Button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {filteredItems.map((note) => {
                const isSelected = note.id === activeNoteId;
                return (
                  <div
                    key={note.id}
                    onClick={() => setActiveNoteId(note.id)}
                    className={`card group cursor-pointer p-3.5 transition-all hover:border-primary/50 ${
                      isSelected ? "border-primary bg-accent/40 shadow-sm" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold">
                            {note.title || "Untitled Note"}
                          </p>
                          {note.ai_indexing_enabled && (
                            <span title="Included in AI Search" className="shrink-0 text-primary">
                              <Sparkles className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {note.content || "Empty note"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite.mutate({ id: note.id, favorite: !note.favorite });
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          aria-label="Star note"
                        >
                          <Star
                            className={`h-3.5 w-3.5 ${
                              note.favorite ? "fill-amber-500 text-amber-500" : ""
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteCandidate(note);
                          }}
                          className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                          aria-label="Delete note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{note.category || "General"}</span>
                      <span>{new Date(note.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Note Editor */}
        <div className={!activeNoteId ? "hidden lg:block" : "block"}>
          {activeNote ? (
            <div className="card flex flex-col p-6 space-y-4 min-h-[580px]">
              {/* Top editor bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveNoteId(null)}
                    className="lg:hidden rounded p-1 hover:bg-muted"
                    aria-label="Back to notes list"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="input h-8 py-0 px-2 text-xs w-32"
                  >
                    {NOTE_CATEGORIES.filter((c) => c !== "All").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  {/* Autosave status indicator */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {saveStatus === "saving" && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span>Saving…</span>
                      </>
                    )}
                    {saveStatus === "saved" && (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">Saved</span>
                      </>
                    )}
                    {saveStatus === "error" && (
                      <span className="text-destructive font-medium">Save failed</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditFavorite(!editFavorite)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label="Favorite note"
                  >
                    <Star
                      className={`h-4 w-4 ${editFavorite ? "fill-amber-500 text-amber-500" : ""}`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeleteCandidate(activeNote)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Title Input */}
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Note title..."
                className="w-full bg-transparent text-xl font-bold tracking-tight outline-none placeholder:text-muted-foreground"
              />

              {/* Content Textarea */}
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Write your note here... (Markdown supported)"
                className="flex-1 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground min-h-[300px]"
              />

              {/* Tags & AI indexing settings */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Tags:
                  </span>
                  {editTags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                    >
                      #{t}
                      <button
                        onClick={() => handleRemoveTag(t)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                      placeholder="Add tag..."
                      className="h-6 w-24 rounded border bg-transparent px-1.5 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium hover:bg-muted/80"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <div>
                      <p className="font-semibold">Include in SafeVault AI Search</p>
                      <p className="text-muted-foreground">
                        Allow SafeVault AI to answer questions using content from this note.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={editAiIndex}
                    onCheckedChange={(checked) => setEditAiIndex(checked)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center p-16 text-center text-muted-foreground min-h-[580px]">
              <StickyNote className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-base font-semibold text-foreground">Select a note or create one</p>
              <p className="text-xs max-w-xs mt-1">
                Your notes are encrypted in this browser session before being saved to the database.
              </p>
              <Button onClick={handleCreateNew} className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> Create Note
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteCandidate} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <DialogTitle>Delete Note</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-foreground">
              {deleteCandidate?.title || "Untitled Note"}
            </span>
            ? This cannot be undone.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteCandidate(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteNote} disabled={remove.isPending}>
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
