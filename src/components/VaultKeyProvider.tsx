import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { createVaultKeys, unlockVaultKeys } from "@/lib/vault-crypto";

type VaultKeyContextValue = { key: CryptoKey; lock: () => void } | null;
const VaultKeyContext = createContext<VaultKeyContextValue>(null);

export function VaultKeyProvider({ children }: { children: ReactNode }) {
  const [passphrase, setPassphrase] = useState("");
  const [working, setWorking] = useState(false);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const { data: config, isLoading, error, refetch } = useQuery({
    queryKey: ["vault-key-config"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in to unlock your vault.");
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("vault_encryption_salt,vault_verifier")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      return { userId: auth.user.id, salt: data?.vault_encryption_salt ?? null, verifier: data?.vault_verifier ?? null };
    },
  });

  useEffect(() => { setVaultKey(null); }, [config?.userId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config || working) return;
    setWorking(true);
    try {
      if (config.salt && config.verifier) {
        setVaultKey(await unlockVaultKeys(passphrase, config.salt, config.verifier));
      } else {
        const created = await createVaultKeys(passphrase);
        const { error: saveError } = await supabase.from("profiles").update({
          vault_encryption_salt: created.salt,
          vault_verifier: created.verifier,
          updated_at: new Date().toISOString(),
        }).eq("id", config.userId);
        if (saveError) throw saveError;
        await refetch();
        setVaultKey(created.encryptionKey);
      }
      setPassphrase("");
    } catch (err) {
      window.dispatchEvent(new CustomEvent("safevault-toast-error", { detail: err instanceof Error ? err.message : "Could not unlock the vault." }));
    } finally {
      setWorking(false);
    }
  }

  const context = useMemo<VaultKeyContextValue>(() => vaultKey ? { key: vaultKey, lock: () => setVaultKey(null) } : null, [vaultKey]);
  if (isLoading) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Opening your private vault…</div>;
  if (error || !config) return <div className="grid min-h-screen place-items-center p-6 text-sm text-destructive">Your vault settings could not be loaded. Sign in again and retry.</div>;
  if (!vaultKey) {
    const isSetup = !config.salt || !config.verifier;
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <form onSubmit={submit} className="card w-full max-w-md space-y-5 p-7">
          <Logo />
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-primary"><LockKeyhole className="size-5" /></div>
            <div>
              <h1 className="text-xl font-semibold">{isSetup ? "Create your vault passphrase" : "Unlock your vault"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Your notes, credentials, recordings and AI history are encrypted on this device before they are saved.</p>
            </div>
          </div>
          <label className="block text-sm font-medium" htmlFor="vault-passphrase">Vault passphrase</label>
          <input id="vault-passphrase" autoComplete="current-password" className="input" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength={12} required placeholder="At least 12 characters" />
          {isSetup && <p className="text-xs text-warning">Keep this passphrase safe. It cannot be recovered; SafeVault cannot decrypt these records without it.</p>}
          <Button className="w-full" type="submit" disabled={working || (isSetup && passphrase.length < 12)}>
            {working ? "Securing your vault…" : isSetup ? "Create encrypted vault" : "Unlock vault"}
          </Button>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" />AES-256-GCM encryption key stays in this browser session.</p>
        </form>
      </div>
    );
  }
  return <VaultKeyContext.Provider value={context}>{children}</VaultKeyContext.Provider>;
}

export function useVaultKey() {
  const context = useContext(VaultKeyContext);
  if (!context) throw new Error("The encrypted vault is locked.");
  return context;
}