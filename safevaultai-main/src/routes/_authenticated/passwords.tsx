import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Search,
  Star,
  Trash2,
  ExternalLink,
  RefreshCw,
  Edit2,
  ShieldAlert,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { VaultGate, useVaultKey } from "@/components/VaultKeyProvider";
import { usePasswords, type PasswordItem, type DecryptedPassword } from "@/hooks/use-vault";
import {
  calculatePasswordStrength,
  generateSecurePassword,
  type PasswordStrengthLevel,
} from "@/lib/vault-crypto";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/passwords")({
  head: () => ({
    meta: [
      { title: "Passwords Vault — SafeVault" },
      { name: "description", content: "Secure client-side encrypted password manager." },
    ],
  }),
  component: PasswordsRoute,
});

const CATEGORIES = ["All", "Logins", "Cards", "Secure Notes", "Identity", "Other"] as const;

function PasswordsRoute() {
  return (
    <VaultGate
      title="Passwords Vault is locked"
      description="Enter your vault passphrase to view and decrypt your stored passwords."
    >
      <PasswordsManager />
    </VaultGate>
  );
}

function PasswordsManager() {
  const { key } = useVaultKey();
  const { data: items = [], isLoading, create, update, remove, toggleFavorite } = usePasswords(key);

  const [category, setCategory] = useState<string>("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [editingItem, setEditingItem] = useState<PasswordItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<PasswordItem | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formCategory, setFormCategory] = useState("Logins");
  const [formNotes, setFormNotes] = useState("");
  const [formFavorite, setFormFavorite] = useState(false);
  const [showPasswordInForm, setShowPasswordInForm] = useState(false);

  // Generator settings
  const [genLength, setGenLength] = useState(18);
  const [genSymbols, setGenSymbols] = useState(true);
  const [showGenOptions, setShowGenOptions] = useState(false);

  // Card view reveal states (id -> boolean)
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (favoritesOnly && !item.favorite) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(query);
        const matchesUsername = item.username?.toLowerCase().includes(query);
        const matchesUrl = item.website_url?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesUsername && !matchesUrl) return false;
      }
      return true;
    });
  }, [items, category, favoritesOnly, search]);

  const strength = useMemo(() => calculatePasswordStrength(formPassword), [formPassword]);

  function handleOpenCreate() {
    setEditingItem(null);
    setFormTitle("");
    setFormUrl("");
    setFormUsername("");
    setFormPassword(generateSecurePassword({ length: 16, symbols: true }));
    setFormCategory("Logins");
    setFormNotes("");
    setFormFavorite(false);
    setShowPasswordInForm(false);
    setIsDialogOpen(true);
  }

  function handleOpenEdit(item: PasswordItem) {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormUrl(item.website_url || "");
    setFormUsername(item.username || "");
    setFormPassword(item.password);
    setFormCategory(item.category || "Logins");
    setFormNotes(item.notes || "");
    setFormFavorite(item.favorite);
    setShowPasswordInForm(false);
    setIsDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formPassword) {
      toast.error("Password is required");
      return;
    }

    const payload: DecryptedPassword = {
      title: formTitle.trim(),
      website_url: formUrl.trim() || undefined,
      username: formUsername.trim() || undefined,
      password: formPassword,
      category: formCategory,
      notes: formNotes.trim() || undefined,
    };

    try {
      if (editingItem) {
        await update.mutateAsync({
          id: editingItem.id,
          payload,
          favorite: formFavorite,
        });
        toast.success("Password updated securely");
      } else {
        await create.mutateAsync({
          ...payload,
          favorite: formFavorite,
        });
        toast.success("Password saved and encrypted");
      }
      setIsDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save password");
    }
  }

  async function handleDelete() {
    if (!deleteCandidate) return;
    try {
      await remove.mutateAsync({ id: deleteCandidate.id, title: deleteCandidate.title });
      toast.success("Password removed");
      setDeleteCandidate(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete password");
    }
  }

  function copyToClipboard(text: string, label: string, key?: string) {
    if (!navigator.clipboard) {
      toast.error("Clipboard access not available in this browser");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success(`${label} copied to clipboard`);
        if (key) {
          setCopiedId(key);
          setTimeout(() => setCopiedId(null), 2000);
        }
      })
      .catch(() => {
        toast.error("Failed to copy to clipboard");
      });
  }

  function triggerGenerate() {
    const pw = generateSecurePassword({ length: genLength, symbols: genSymbols });
    setFormPassword(pw);
    toast.success("Generated strong random password");
  }

  const strengthColor: Record<PasswordStrengthLevel, string> = {
    weak: "bg-destructive",
    fair: "bg-amber-500",
    good: "bg-blue-500",
    strong: "bg-emerald-500",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Passwords Vault"
        sub="Zero-knowledge, client-side AES-256-GCM encrypted passwords. Never shared with servers in plaintext."
        action={
          <Button onClick={handleOpenCreate} className="gap-2 font-semibold shadow-sm">
            <Plus className="h-4 w-4" /> Add Password
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
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
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              favoritesOnly
                ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-card hover:bg-muted"
            }`}
          >
            <Star
              className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-amber-500 text-amber-500" : ""}`}
            />
            Favorites
          </button>
        </div>

        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search passwords by title, username..."
            className="input pl-9 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="card p-12 text-center text-sm text-muted-foreground">
          Decrypting your password vault…
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold">No passwords found</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search || category !== "All" || favoritesOnly
              ? "No entries match your current search and filter criteria."
              : "Store your logins, credentials, and secure keys safely with client-side encryption."}
          </p>
          {!search && category === "All" && !favoritesOnly && (
            <Button onClick={handleOpenCreate} className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Add your first password
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const isRevealed = !!revealedIds[item.id];
            return (
              <div
                key={item.id}
                className="card relative flex flex-col justify-between p-5 transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-primary">
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold leading-tight">
                          {item.title}
                        </p>
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {item.category || "Logins"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          toggleFavorite.mutate({ id: item.id, favorite: !item.favorite })
                        }
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                        aria-label="Favorite"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            item.favorite
                              ? "fill-amber-500 text-amber-500"
                              : "hover:text-foreground"
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteCandidate(item)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {item.website_url && (
                    <a
                      href={
                        item.website_url.startsWith("http")
                          ? item.website_url
                          : `https://${item.website_url}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span className="truncate max-w-[200px]">
                        {item.website_url.replace(/^https?:\/\//, "")}
                      </span>
                    </a>
                  )}

                  <div className="mt-4 space-y-2.5 text-xs">
                    {item.username && (
                      <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
                        <span className="text-muted-foreground">Username:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{item.username}</span>
                          <button
                            onClick={() =>
                              copyToClipboard(item.username!, "Username", `${item.id}-user`)
                            }
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Copy username"
                          >
                            {copiedId === `${item.id}-user` ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
                      <span className="text-muted-foreground">Password:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">
                          {isRevealed ? item.password : "••••••••••••"}
                        </span>
                        <button
                          onClick={() =>
                            setRevealedIds((prev) => ({ ...prev, [item.id]: !isRevealed }))
                          }
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={isRevealed ? "Hide password" : "Show password"}
                        >
                          {isRevealed ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() =>
                            copyToClipboard(item.password, "Password", `${item.id}-pw`)
                          }
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Copy password"
                        >
                          {copiedId === `${item.id}-pw` ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {item.notes && (
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground italic">
                        {item.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t text-[11px] text-muted-foreground flex justify-between">
                  <span>Updated {new Date(item.updated_at).toLocaleDateString()}</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Encrypted
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Password Entry" : "Create Password Entry"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1">Title *</label>
              <input
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Google Account, GitHub, Bank Portal"
                className="input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="input"
                >
                  {CATEGORIES.filter((c) => c !== "All").map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Website URL (optional)</label>
                <input
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://..."
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Username or Email</label>
              <input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="user@example.com"
                className="input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium">Password *</label>
                <button
                  type="button"
                  onClick={triggerGenerate}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <RefreshCw className="h-3 w-3" /> Generate Strong
                </button>
              </div>

              <div className="relative">
                <input
                  required
                  type={showPasswordInForm ? "text" : "password"}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Password"
                  className="input pr-16 font-mono"
                />
                <div className="absolute right-2 top-2 flex items-center gap-1 text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setShowPasswordInForm(!showPasswordInForm)}
                    className="p-1 hover:text-foreground"
                    aria-label="Toggle password visibility"
                  >
                    {showPasswordInForm ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(formPassword, "Password")}
                    className="p-1 hover:text-foreground"
                    aria-label="Copy password"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Password Strength Indicator */}
              {formPassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Strength:</span>
                    <span className="font-semibold capitalize text-foreground">
                      {strength.level} ({strength.score}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${strengthColor[strength.level]}`}
                      style={{ width: `${Math.max(10, strength.score)}%` }}
                    />
                  </div>
                  {strength.feedback.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Tip: {strength.feedback.join(", ")}
                    </p>
                  )}
                </div>
              )}

              {/* Generator Options Drawer */}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowGenOptions(!showGenOptions)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Sliders className="h-3 w-3" />
                  {showGenOptions ? "Hide generator settings" : "Custom generator settings"}
                </button>

                {showGenOptions && (
                  <div className="mt-2 rounded-lg border bg-muted/40 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span>Length: {genLength}</span>
                      <input
                        type="range"
                        min="8"
                        max="32"
                        value={genLength}
                        onChange={(e) => setGenLength(Number(e.target.value))}
                        className="w-32"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={genSymbols}
                        onChange={(e) => setGenSymbols(e.target.checked)}
                        className="rounded"
                      />
                      <span>Include special symbols (!@#$%^&*)</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Secure Notes (optional)</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                placeholder="Extra security questions, PINs, recovery codes..."
                className="input resize-none text-xs"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={formFavorite}
                onChange={(e) => setFormFavorite(e.target.checked)}
                className="rounded"
              />
              <span>Mark as favorite</span>
            </label>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {create.isPending || update.isPending ? "Encrypting…" : "Save Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteCandidate} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <DialogTitle>Delete Password</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-foreground">{deleteCandidate?.title}</span>? This
            cannot be undone.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteCandidate(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
