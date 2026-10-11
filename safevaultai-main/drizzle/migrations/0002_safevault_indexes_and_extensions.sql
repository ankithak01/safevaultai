-- SafeVault forward migration: Indexes and document encryption nonce
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_nonce TEXT;

CREATE INDEX IF NOT EXISTS password_entries_user_updated_idx ON public.password_entries (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS notes_user_updated_idx ON public.notes (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS voice_notes_user_created_idx ON public.voice_notes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_user_created_idx ON public.activity_log (user_id, created_at DESC);
