ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vault_encryption_salt TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vault_verifier TEXT;
CREATE TABLE public.password_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  encrypted_payload TEXT NOT NULL,
  payload_nonce TEXT NOT NULL,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_entries TO authenticated;
GRANT ALL ON public.password_entries TO service_role;
ALTER TABLE public.password_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own password entries select" ON public.password_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own password entries insert" ON public.password_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own password entries update" ON public.password_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own password entries delete" ON public.password_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  encrypted_payload TEXT NOT NULL,
  payload_nonce TEXT NOT NULL,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  ai_indexing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own notes select" ON public.notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own notes insert" ON public.notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own notes update" ON public.notes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own notes delete" ON public.notes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TABLE public.voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  encrypted_title TEXT NOT NULL,
  title_nonce TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  audio_nonce TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  transcript_ciphertext TEXT,
  transcript_nonce TEXT,
  ai_indexing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  transcription_status TEXT NOT NULL DEFAULT 'not_requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_notes TO authenticated;
GRANT ALL ON public.voice_notes TO service_role;
ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own voice notes select" ON public.voice_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own voice notes insert" ON public.voice_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own voice notes update" ON public.voice_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own voice notes delete" ON public.voice_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TABLE public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_sessions TO authenticated;
GRANT ALL ON public.chat_sessions TO service_role;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own chat sessions select" ON public.chat_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own chat sessions insert" ON public.chat_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own chat sessions update" ON public.chat_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own chat sessions delete" ON public.chat_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  encrypted_payload TEXT NOT NULL,
  payload_nonce TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own chat messages select" ON public.chat_messages FOR SELECT TO authenticated USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "Own chat messages insert" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "Own chat messages update" ON public.chat_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())) WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "Own chat messages delete" ON public.chat_messages FOR DELETE TO authenticated USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chat_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE INDEX chat_sessions_user_updated_idx ON public.chat_sessions (user_id, updated_at DESC);
CREATE INDEX chat_messages_session_created_idx ON public.chat_messages (session_id, created_at ASC);
CREATE POLICY "Own voice recordings select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Own voice recordings insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Own voice recordings update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Own voice recordings delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'voice-notes' AND (storage.foldername(name))[1] = auth.uid()::text);