import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createVaultKeys, unlockVaultKeys } from "@/lib/vault-crypto";
import { toast } from "sonner";

export interface VaultKeyContextValue {
  key: CryptoKey | null;
  isUnlocked: boolean;
  isConfigured: boolean;
  isLoading: boolean;
  lock: () => void;
  unlock: (passphrase: string) => Promise<void>;
  setup: (passphrase: string) => Promise<void>;
}

const VaultKeyContext = createContext<VaultKeyContextValue | null>(null);

export function VaultKeyProvider({ children }: { children: ReactNode }) {
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);

  const {
    data: config,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["vault-key-config"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("vault_encryption_salt,vault_verifier")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      return {
        userId: auth.user.id,
        salt: data?.vault_encryption_salt ?? null,
        verifier: data?.vault_verifier ?? null,
      };
    },
  });

  useEffect(() => {
    // Clear key if user changes or signs out
    setVaultKey(null);
  }, [config?.userId]);

  const lock = () => {
    setVaultKey(null);
    toast.info("Vault locked. Passphrase required to view encrypted items.");
  };

  const unlock = async (passphrase: string) => {
    if (!config?.salt || !config?.verifier) {
      throw new Error("Vault is not configured yet. Create a passphrase first.");
    }
    const derivedKey = await unlockVaultKeys(passphrase, config.salt, config.verifier);
    setVaultKey(derivedKey);
  };

  const setup = async (passphrase: string) => {
    if (!config?.userId) throw new Error("You must be signed in.");
    if (passphrase.length < 12) {
      throw new Error("Vault passphrase must be at least 12 characters.");
    }
    const created = await createVaultKeys(passphrase);
    const { error: saveError } = await supabase
      .from("profiles")
      .update({
        vault_encryption_salt: created.salt,
        vault_verifier: created.verifier,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.userId);
    if (saveError) throw saveError;
    await refetch();
    setVaultKey(created.encryptionKey);
  };

  const value = useMemo<VaultKeyContextValue>(
    () => ({
      key: vaultKey,
      isUnlocked: !!vaultKey,
      isConfigured: !!(config?.salt && config?.verifier),
      isLoading,
      lock,
      unlock,
      setup,
    }),
    [vaultKey, config, isLoading],
  );

  return <VaultKeyContext.Provider value={value}>{children}</VaultKeyContext.Provider>;
}

export function useVaultKey(): VaultKeyContextValue {
  const context = useContext(VaultKeyContext);
  if (!context) {
    throw new Error("useVaultKey must be used within a VaultKeyProvider");
  }
  return context;
}

export function VaultGate({
  children,
  title = "Vault is locked",
  description = "Enter your vault passphrase to access your private encrypted items.",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { isUnlocked, isConfigured, unlock, setup, isLoading } = useVaultKey();
  const [passphrase, setPassphrase] = useState("");
  const [working, setWorking] = useState(false);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">Checking vault status…</div>
    );
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  const isSetup = !isConfigured;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    setWorking(true);
    try {
      if (isSetup) {
        await setup(passphrase);
        toast.success("Vault passphrase created and vault unlocked!");
      } else {
        await unlock(passphrase);
        toast.success("Vault unlocked!");
      }
      setPassphrase("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlock vault");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-12">
      <form onSubmit={handleSubmit} className="card w-full space-y-5 p-7">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-primary">
            <LockKeyhole className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{isSetup ? "Create Vault Passphrase" : title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSetup
                ? "Choose a secure passphrase with at least 12 characters. Your credentials, notes, and transcripts are encrypted client-side with AES-256-GCM."
                : description}
            </p>
          </div>
        </div>

        <label className="block text-sm font-medium" htmlFor="gate-passphrase">
          {isSetup ? "Create passphrase (min 12 chars)" : "Vault passphrase"}
        </label>
        <input
          id="gate-passphrase"
          autoComplete="current-password"
          className="input"
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          minLength={12}
          required
          placeholder="At least 12 characters"
        />

        {isSetup && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Keep this passphrase safe. It cannot be recovered; SafeVault cannot decrypt your private
            records without it.
          </p>
        )}

        <Button
          className="w-full"
          type="submit"
          disabled={working || (isSetup && passphrase.length < 12)}
        >
          {working ? "Securing your vault…" : isSetup ? "Create Encrypted Vault" : "Unlock Vault"}
        </Button>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-emerald-500" />
          Zero-Knowledge: AES-256-GCM key derived on device, never sent to server.
        </p>
      </form>
    </div>
  );
}
