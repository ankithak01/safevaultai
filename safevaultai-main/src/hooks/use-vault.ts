import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Doc } from "@/lib/docs";
import {
  decryptVaultText,
  decryptVaultValue,
  encryptVaultText,
  encryptVaultValue,
} from "@/lib/vault-crypto";

export interface DecryptedPassword {
  title: string;
  website_url?: string | undefined;
  username?: string | undefined;
  password: string;
  category?: string | undefined;
  notes?: string | undefined;
}

export interface PasswordItem extends DecryptedPassword {
  id: string;
  user_id: string;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface DecryptedNote {
  title: string;
  content: string;
  category?: string | undefined;
  tags?: string[] | undefined;
}

export interface NoteItem extends DecryptedNote {
  id: string;
  user_id: string;
  favorite: boolean;
  ai_indexing_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoiceNoteItem {
  id: string;
  user_id: string;
  title: string;
  storage_path: string;
  audio_nonce: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  transcript: string | null;
  ai_indexing_enabled: boolean;
  transcription_status: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionItem {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessagePayload {
  content: string;
  source?: { id: string; name: string } | null;
}

export interface ChatMessageItem {
  id: string;
  user_id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  source?: { id: string; name: string } | null;
  created_at: string;
}

export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
  });
}

export function useSession() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      return { user, profile };
    },
  });
}

export async function logActivity(action: string, detail?: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase
    .from("activity_log")
    .insert({ user_id: data.user.id, action, detail: detail ?? null });
}

export function usePasswords(key: CryptoKey | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["passwords", !!key],
    enabled: !!key,
    queryFn: async () => {
      if (!key) return [];
      const { data, error } = await supabase
        .from("password_entries")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const items: PasswordItem[] = [];
      for (const row of data ?? []) {
        try {
          const decrypted = await decryptVaultValue<DecryptedPassword>(
            key,
            row.encrypted_payload,
            row.payload_nonce,
          );
          items.push({
            id: row.id,
            user_id: row.user_id,
            favorite: row.favorite,
            created_at: row.created_at,
            updated_at: row.updated_at,
            ...decrypted,
          });
        } catch (e) {
          console.error("Failed to decrypt password entry", row.id, e);
        }
      }
      return items;
    },
  });

  const create = useMutation({
    mutationFn: async (payload: DecryptedPassword & { favorite?: boolean }) => {
      if (!key) throw new Error("Vault locked");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const enc = await encryptVaultValue(key, {
        title: payload.title,
        website_url: payload.website_url,
        username: payload.username,
        password: payload.password,
        category: payload.category || "Logins",
        notes: payload.notes,
      });

      const { data, error } = await supabase
        .from("password_entries")
        .insert({
          user_id: auth.user.id,
          encrypted_payload: enc.encrypted_payload,
          payload_nonce: enc.payload_nonce,
          favorite: payload.favorite ?? false,
        })
        .select()
        .single();

      if (error) throw error;
      await logActivity("Password created", payload.title);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["passwords"] });
      qc.invalidateQueries({ queryKey: ["vault-stats"] });
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      payload,
      favorite,
    }: {
      id: string;
      payload: DecryptedPassword;
      favorite?: boolean;
    }) => {
      if (!key) throw new Error("Vault locked");
      const enc = await encryptVaultValue(key, {
        title: payload.title,
        website_url: payload.website_url,
        username: payload.username,
        password: payload.password,
        category: payload.category || "Logins",
        notes: payload.notes,
      });

      const updates: {
        encrypted_payload: string;
        payload_nonce: string;
        updated_at: string;
        favorite?: boolean;
      } = {
        encrypted_payload: enc.encrypted_payload,
        payload_nonce: enc.payload_nonce,
        updated_at: new Date().toISOString(),
      };
      if (favorite !== undefined) updates.favorite = favorite;

      const { error } = await supabase.from("password_entries").update(updates).eq("id", id);
      if (error) throw error;
      await logActivity("Password updated", payload.title);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["passwords"] });
    },
  });

  const remove = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from("password_entries").delete().eq("id", id);
      if (error) throw error;
      await logActivity("Password deleted", title);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["passwords"] });
      qc.invalidateQueries({ queryKey: ["vault-stats"] });
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
      const { error } = await supabase
        .from("password_entries")
        .update({ favorite, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["passwords"] });
    },
  });

  return {
    ...query,
    create,
    update,
    remove,
    toggleFavorite,
  };
}

export function useNotes(key: CryptoKey | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["notes", !!key],
    enabled: !!key,
    queryFn: async () => {
      if (!key) return [];
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const items: NoteItem[] = [];
      for (const row of data ?? []) {
        try {
          const decrypted = await decryptVaultValue<DecryptedNote>(
            key,
            row.encrypted_payload,
            row.payload_nonce,
          );
          items.push({
            id: row.id,
            user_id: row.user_id,
            favorite: row.favorite,
            ai_indexing_enabled: row.ai_indexing_enabled,
            created_at: row.created_at,
            updated_at: row.updated_at,
            ...decrypted,
          });
        } catch (e) {
          console.error("Failed to decrypt note", row.id, e);
        }
      }
      return items;
    },
  });

  const create = useMutation({
    mutationFn: async (
      payload: DecryptedNote & { favorite?: boolean; ai_indexing_enabled?: boolean },
    ) => {
      if (!key) throw new Error("Vault locked");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const enc = await encryptVaultValue(key, {
        title: payload.title,
        content: payload.content,
        category: payload.category || "General",
        tags: payload.tags || [],
      });

      const { data, error } = await supabase
        .from("notes")
        .insert({
          user_id: auth.user.id,
          encrypted_payload: enc.encrypted_payload,
          payload_nonce: enc.payload_nonce,
          favorite: payload.favorite ?? false,
          ai_indexing_enabled: payload.ai_indexing_enabled ?? false,
        })
        .select()
        .single();

      if (error) throw error;
      await logActivity("Note created", payload.title);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["vault-stats"] });
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      payload,
      favorite,
      ai_indexing_enabled,
    }: {
      id: string;
      payload: DecryptedNote;
      favorite?: boolean;
      ai_indexing_enabled?: boolean;
    }) => {
      if (!key) throw new Error("Vault locked");
      const enc = await encryptVaultValue(key, {
        title: payload.title,
        content: payload.content,
        category: payload.category || "General",
        tags: payload.tags || [],
      });

      const updates: {
        encrypted_payload: string;
        payload_nonce: string;
        updated_at: string;
        favorite?: boolean;
        ai_indexing_enabled?: boolean;
      } = {
        encrypted_payload: enc.encrypted_payload,
        payload_nonce: enc.payload_nonce,
        updated_at: new Date().toISOString(),
      };
      if (favorite !== undefined) updates.favorite = favorite;
      if (ai_indexing_enabled !== undefined) updates.ai_indexing_enabled = ai_indexing_enabled;

      const { error } = await supabase.from("notes").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  const remove = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) throw error;
      await logActivity("Note deleted", title);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      qc.invalidateQueries({ queryKey: ["vault-stats"] });
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
      const { error } = await supabase
        .from("notes")
        .update({ favorite, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  const toggleAiIndex = useMutation({
    mutationFn: async ({
      id,
      ai_indexing_enabled,
    }: {
      id: string;
      ai_indexing_enabled: boolean;
    }) => {
      const { error } = await supabase
        .from("notes")
        .update({ ai_indexing_enabled, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await logActivity(
        ai_indexing_enabled ? "Note enabled for AI search" : "Note removed from AI search",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  return {
    ...query,
    create,
    update,
    remove,
    toggleFavorite,
    toggleAiIndex,
  };
}

export function useVoiceNotes(key: CryptoKey | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["voice-notes", !!key],
    enabled: !!key,
    queryFn: async () => {
      if (!key) return [];
      const { data, error } = await supabase
        .from("voice_notes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const items: VoiceNoteItem[] = [];
      for (const row of data ?? []) {
        try {
          const title = await decryptVaultText(key, row.encrypted_title, row.title_nonce);
          let transcript: string | null = null;
          if (row.transcript_ciphertext && row.transcript_nonce) {
            try {
              transcript = await decryptVaultText(
                key,
                row.transcript_ciphertext,
                row.transcript_nonce,
              );
            } catch {
              transcript = null;
            }
          }

          items.push({
            id: row.id,
            user_id: row.user_id,
            title,
            storage_path: row.storage_path,
            audio_nonce: row.audio_nonce,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            duration_seconds: row.duration_seconds,
            transcript,
            ai_indexing_enabled: row.ai_indexing_enabled,
            transcription_status: row.transcription_status,
            created_at: row.created_at,
            updated_at: row.updated_at,
          });
        } catch (e) {
          console.error("Failed to decrypt voice note", row.id, e);
        }
      }
      return items;
    },
  });

  const remove = useMutation({
    mutationFn: async (item: VoiceNoteItem) => {
      // 1. Remove storage object
      await supabase.storage.from("voice-notes").remove([item.storage_path]);
      // 2. Remove database row
      const { error } = await supabase.from("voice_notes").delete().eq("id", item.id);
      if (error) throw error;
      await logActivity("Voice note deleted", item.title);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-notes"] });
      qc.invalidateQueries({ queryKey: ["vault-stats"] });
    },
  });

  const updateTitle = useMutation({
    mutationFn: async ({ id, newTitle }: { id: string; newTitle: string }) => {
      if (!key) throw new Error("Vault locked");
      const enc = await encryptVaultText(key, newTitle);
      const { error } = await supabase
        .from("voice_notes")
        .update({
          encrypted_title: enc.ciphertext,
          title_nonce: enc.nonce,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-notes"] });
    },
  });

  const updateTranscript = useMutation({
    mutationFn: async ({ id, transcript }: { id: string; transcript: string }) => {
      if (!key) throw new Error("Vault locked");
      const enc = await encryptVaultText(key, transcript);
      const { error } = await supabase
        .from("voice_notes")
        .update({
          transcript_ciphertext: enc.ciphertext,
          transcript_nonce: enc.nonce,
          transcription_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-notes"] });
    },
  });

  const toggleAiIndex = useMutation({
    mutationFn: async ({
      id,
      ai_indexing_enabled,
    }: {
      id: string;
      ai_indexing_enabled: boolean;
    }) => {
      const { error } = await supabase
        .from("voice_notes")
        .update({ ai_indexing_enabled, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice-notes"] });
    },
  });

  return {
    ...query,
    remove,
    updateTitle,
    updateTranscript,
    toggleAiIndex,
  };
}

export function useChatSessions() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChatSessionItem[];
    },
  });

  const create = useMutation<ChatSessionItem, Error, string | undefined>({
    mutationFn: async (title = "New Conversation") => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ user_id: auth.user.id, title })
        .select()
        .single();
      if (error) throw error;
      return data as ChatSessionItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  const rename = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("chat_sessions")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  return {
    ...query,
    create,
    rename,
    remove,
  };
}

export function useChatMessages(sessionId: string | null, key: CryptoKey | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["chat-messages", sessionId, !!key],
    enabled: !!sessionId && !!key,
    queryFn: async () => {
      if (!sessionId || !key) return [];
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const items: ChatMessageItem[] = [];
      for (const row of data ?? []) {
        try {
          const payload = await decryptVaultValue<ChatMessagePayload>(
            key,
            row.encrypted_payload,
            row.payload_nonce,
          );
          items.push({
            id: row.id,
            user_id: row.user_id,
            session_id: row.session_id,
            role: row.role as "user" | "assistant",
            content: payload.content,
            source: payload.source ?? null,
            created_at: row.created_at,
          });
        } catch (e) {
          console.error("Failed to decrypt message", row.id, e);
        }
      }
      return items;
    },
  });

  const append = useMutation({
    mutationFn: async ({
      role,
      content,
      source,
    }: {
      role: "user" | "assistant";
      content: string;
      source?: { id: string; name: string } | null;
    }) => {
      if (!sessionId || !key) throw new Error("Vault locked or no active session");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");

      const enc = await encryptVaultValue(key, { content, source: source ?? null });
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({
          user_id: auth.user.id,
          session_id: sessionId,
          role,
          encrypted_payload: enc.encrypted_payload,
          payload_nonce: enc.payload_nonce,
        })
        .select()
        .single();
      if (error) throw error;

      // Update session timestamp
      await supabase
        .from("chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sessionId);

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-messages", sessionId] });
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  return {
    ...query,
    append,
  };
}

export function useVaultStats() {
  return useQuery({
    queryKey: ["vault-stats"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;

      const [docsRes, passRes, notesRes, voiceRes] = await Promise.all([
        supabase.from("documents").select("size_bytes,expiry_date,created_at"),
        supabase.from("password_entries").select("id", { count: "exact", head: true }),
        supabase.from("notes").select("id", { count: "exact", head: true }),
        supabase.from("voice_notes").select("size_bytes,duration_seconds"),
      ]);

      const docs = docsRes.data ?? [];
      const voice = voiceRes.data ?? [];

      const docBytes = docs.reduce((a, d) => a + (d.size_bytes || 0), 0);
      const voiceBytes = voice.reduce((a, v) => a + (v.size_bytes || 0), 0);
      const totalStorage = docBytes + voiceBytes;

      return {
        totalDocuments: docs.length,
        totalPasswords: passRes.count ?? 0,
        totalNotes: notesRes.count ?? 0,
        totalVoiceNotes: voice.length,
        docBytes,
        voiceBytes,
        totalStorageBytes: totalStorage,
      };
    },
  });
}
