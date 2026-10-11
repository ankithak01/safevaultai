import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Play,
  Pause,
  Upload,
  Search,
  Trash2,
  Edit2,
  Sparkles,
  FileAudio,
  AlertCircle,
  FileText,
  Volume2,
  Save,
  Check,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { VaultGate, useVaultKey } from "@/components/VaultKeyProvider";
import { useVoiceNotes, type VoiceNoteItem } from "@/hooks/use-vault";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { decryptVaultBytes, encryptVaultBytes, encryptVaultText } from "@/lib/vault-crypto";
import { formatBytes } from "@/lib/docs";

export const Route = createFileRoute("/_authenticated/voice-notes")({
  head: () => ({
    meta: [
      { title: "Voice Notes — SafeVault" },
      { name: "description", content: "Client-side encrypted audio recordings and voice notes." },
    ],
  }),
  component: VoiceNotesRoute,
});

function VoiceNotesRoute() {
  return (
    <VaultGate
      title="Voice Notes Vault is locked"
      description="Enter your vault passphrase to decrypt your audio recordings and transcripts."
    >
      <VoiceNotesManager />
    </VaultGate>
  );
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function VoiceNotesManager() {
  const { key } = useVaultKey();
  const {
    data: items = [],
    isLoading,
    remove,
    updateTitle,
    updateTranscript,
    toggleAiIndex,
    refetch,
  } = useVoiceNotes(key);

  const [search, setSearch] = useState("");
  const [activePlaybackId, setActivePlaybackId] = useState<string | null>(null);
  const [playbackAudioUrl, setPlaybackAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);

  // Recorder states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedTitle, setRecordedTitle] = useState("");
  const [isSavingRecord, setIsSavingRecord] = useState(false);

  // Edit title / transcript dialogs
  const [editingTitleItem, setEditingTitleItem] = useState<VoiceNoteItem | null>(null);
  const [newTitleValue, setNewTitleValue] = useState("");
  const [editingTranscriptItem, setEditingTranscriptItem] = useState<VoiceNoteItem | null>(null);
  const [transcriptValue, setTranscriptValue] = useState("");
  const [deleteCandidate, setDeleteCandidate] = useState<VoiceNoteItem | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const fileUploadInputRef = useRef<HTMLInputElement>(null);

  // Filtered voice notes
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(query);
        const matchesTranscript = item.transcript?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesTranscript) return false;
      }
      return true;
    });
  }, [items, search]);

  // Clean up blob URLs when changing or unmounting
  useEffect(() => {
    return () => {
      if (playbackAudioUrl) URL.revokeObjectURL(playbackAudioUrl);
    };
  }, [playbackAudioUrl]);

  // Handle Playback
  async function handleTogglePlay(item: VoiceNoteItem) {
    if (activePlaybackId === item.id) {
      if (audioElementRef.current) {
        if (isPlaying) {
          audioElementRef.current.pause();
          setIsPlaying(false);
        } else {
          audioElementRef.current.play();
          setIsPlaying(true);
        }
      }
      return;
    }

    if (!key) {
      toast.error("Vault key is locked");
      return;
    }

    try {
      setLoadingAudioId(item.id);
      setIsPlaying(false);

      // Download encrypted audio blob from private storage
      const { data, error } = await supabase.storage
        .from("voice-notes")
        .download(item.storage_path);
      if (error || !data) throw error || new Error("Failed to download audio object");

      const arrayBuffer = await data.arrayBuffer();
      // Decrypt client-side
      const decryptedBlob = await decryptVaultBytes(
        key,
        arrayBuffer,
        item.audio_nonce,
        item.mime_type || "audio/webm",
      );

      const objectUrl = URL.createObjectURL(decryptedBlob);
      if (playbackAudioUrl) URL.revokeObjectURL(playbackAudioUrl);

      setPlaybackAudioUrl(objectUrl);
      setActivePlaybackId(item.id);

      if (audioElementRef.current) {
        audioElementRef.current.src = objectUrl;
        audioElementRef.current.play();
        setIsPlaying(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to decrypt and play recording");
    } finally {
      setLoadingAudioId(null);
    }
  }

  // Start recording
  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Audio recording is not supported in this browser environment");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setRecordedBlob(audioBlob);
        setRecordedTitle(
          `Voice Note ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        );
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setIsPaused(false);
      setRecordSeconds(0);
      setRecordedBlob(null);

      timerIntervalRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error(err);
      toast.error("Microphone access was denied or is unavailable.");
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    setRecordedBlob(null);
    setRecordSeconds(0);
  }

  // Save recorded or uploaded audio
  async function saveRecording(blobToSave: Blob, titleToSave: string, duration?: number) {
    if (!key) {
      toast.error("Vault locked");
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("Sign in to save voice notes");
      return;
    }

    setIsSavingRecord(true);
    try {
      const buffer = await blobToSave.arrayBuffer();

      // 1. Encrypt audio bytes with AES-256-GCM
      const encryptedAudio = await encryptVaultBytes(key, buffer);

      // 2. Encrypt title with AES-256-GCM
      const encryptedTitle = await encryptVaultText(key, titleToSave.trim() || "Voice Note");

      // 3. Upload encrypted blob to Supabase Storage
      const storagePath = `${auth.user.id}/${crypto.randomUUID()}-audio.bin`;
      const { error: uploadError } = await supabase.storage
        .from("voice-notes")
        .upload(storagePath, encryptedAudio.encrypted, {
          contentType: "application/octet-stream",
        });
      if (uploadError) throw uploadError;

      // 4. Insert row in voice_notes table
      const { error: dbError } = await supabase.from("voice_notes").insert({
        user_id: auth.user.id,
        encrypted_title: encryptedTitle.ciphertext,
        title_nonce: encryptedTitle.nonce,
        storage_path: storagePath,
        audio_nonce: encryptedAudio.nonce,
        mime_type: blobToSave.type || "audio/webm",
        size_bytes: blobToSave.size,
        duration_seconds: duration || recordSeconds || null,
        transcription_status: "not_requested",
        ai_indexing_enabled: false,
      });

      if (dbError) throw dbError;

      toast.success("Voice note encrypted and saved successfully!");
      setRecordedBlob(null);
      setRecordedTitle("");
      setRecordSeconds(0);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save voice note");
    } finally {
      setIsSavingRecord(false);
    }
  }

  // Handle manual file upload
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("Maximum audio file size is 25MB");
      return;
    }

    const title = file.name.replace(/\.[^/.]+$/, "");
    await saveRecording(file, title, undefined);
    e.target.value = "";
  }

  // Handle Title Save
  async function handleSaveTitle() {
    if (!editingTitleItem || !newTitleValue.trim()) return;
    try {
      await updateTitle.mutateAsync({
        id: editingTitleItem.id,
        newTitle: newTitleValue.trim(),
      });
      toast.success("Title updated");
      setEditingTitleItem(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update title");
    }
  }

  // Handle Transcript Save
  async function handleSaveTranscript() {
    if (!editingTranscriptItem) return;
    try {
      await updateTranscript.mutateAsync({
        id: editingTranscriptItem.id,
        transcript: transcriptValue.trim(),
      });
      toast.success("Transcript updated and encrypted");
      setEditingTranscriptItem(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update transcript");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hidden audio element for playback */}
      <audio
        ref={audioElementRef}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        className="hidden"
      />

      <PageHeader
        title="Voice Notes"
        sub="Record or upload audio memos. Encrypted client-side with AES-256-GCM before storage."
        action={
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileUploadInputRef}
              onChange={handleFileUpload}
              accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileUploadInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" /> Upload Audio
            </Button>
            {!isRecording && !recordedBlob && (
              <Button onClick={startRecording} className="gap-2 font-semibold">
                <Mic className="h-4 w-4" /> Record Note
              </Button>
            )}
          </div>
        }
      />

      {/* Live Recording Panel */}
      {isRecording && (
        <div className="card border-primary/40 bg-accent/30 p-6 flex flex-col items-center justify-center space-y-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
            </span>
            <span className="text-xl font-mono font-bold tracking-wider">
              {formatDuration(recordSeconds)}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {isPaused ? "Recording paused" : "Recording in progress… Speak clearly into your mic."}
          </p>

          <div className="flex items-center gap-3">
            {isPaused ? (
              <Button variant="outline" size="sm" onClick={resumeRecording} className="gap-1.5">
                <Play className="h-3.5 w-3.5" /> Resume
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={pauseRecording} className="gap-1.5">
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={stopRecording}
              className="gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              <Square className="h-3.5 w-3.5" /> Stop & Review
            </Button>

            <Button variant="ghost" size="sm" onClick={cancelRecording}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Review & Save Panel */}
      {recordedBlob && !isRecording && (
        <div className="card border-primary/40 p-6 space-y-4 max-w-lg mx-auto">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-primary" /> Review Recorded Voice Note
          </h3>

          <div>
            <label className="block text-xs font-medium mb-1">Title</label>
            <input
              value={recordedTitle}
              onChange={(e) => setRecordedTitle(e.target.value)}
              placeholder="Give this voice note a title..."
              className="input text-sm"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground rounded-lg bg-muted/60 px-3 py-2">
            <span>Duration: {formatDuration(recordSeconds)}</span>
            <span>Size: {formatBytes(recordedBlob.size)}</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={cancelRecording} disabled={isSavingRecord}>
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => saveRecording(recordedBlob, recordedTitle, recordSeconds)}
              disabled={isSavingRecord}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" />
              {isSavingRecord ? "Encrypting & Storing…" : "Encrypt & Save"}
            </Button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recordings by title or transcript..."
          className="input pl-9 text-sm"
        />
      </div>

      {/* Voice Notes List */}
      {isLoading ? (
        <div className="card p-12 text-center text-sm text-muted-foreground">
          Decrypting voice notes list…
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mic className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold">No voice notes found</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search
              ? "No audio notes match your search term."
              : "Record audio notes or upload audio files to encrypt and store privately."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const isThisPlaying = activePlaybackId === item.id && isPlaying;
            const isThisLoading = loadingAudioId === item.id;

            return (
              <div
                key={item.id}
                className="card flex flex-col justify-between p-5 transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-primary">
                        <Volume2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold leading-tight">
                          {item.title}
                        </p>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDuration(item.duration_seconds)} · {formatBytes(item.size_bytes)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingTitleItem(item);
                          setNewTitleValue(item.title);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Rename"
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

                  {/* Playback Controls */}
                  <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted/60 p-3">
                    <Button
                      size="icon-sm"
                      variant="default"
                      onClick={() => handleTogglePlay(item)}
                      disabled={isThisLoading}
                      className="rounded-full shrink-0"
                    >
                      {isThisLoading ? (
                        <span className="animate-spin text-xs">⌛</span>
                      ) : isThisPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4 ml-0.5" />
                      )}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">
                        {isThisLoading
                          ? "Decrypting audio…"
                          : isThisPlaying
                            ? "Playing recording…"
                            : "Encrypted Audio"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.mime_type || "audio/webm"}
                      </p>
                    </div>
                  </div>

                  {/* Transcript section */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Transcript
                      </span>
                      <button
                        onClick={() => {
                          setEditingTranscriptItem(item);
                          setTranscriptValue(item.transcript || "");
                        }}
                        className="text-[11px] text-primary hover:underline"
                      >
                        {item.transcript ? "Edit transcript" : "Add transcript"}
                      </button>
                    </div>

                    {item.transcript ? (
                      <p className="line-clamp-3 rounded bg-muted/30 p-2 text-xs italic text-muted-foreground">
                        "{item.transcript}"
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">No transcript added yet.</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-primary" /> AI Searchable
                    </span>
                    <Switch
                      checked={item.ai_indexing_enabled}
                      onCheckedChange={(checked) =>
                        toggleAiIndex.mutate({ id: item.id, ai_indexing_enabled: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      Encrypted at Rest
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog open={!!editingTitleItem} onOpenChange={(open) => !open && setEditingTitleItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Voice Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block text-xs font-medium">Title</label>
            <input
              value={newTitleValue}
              onChange={(e) => setNewTitleValue(e.target.value)}
              className="input text-sm"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTitleItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTitle} disabled={updateTitle.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transcript Dialog */}
      <Dialog
        open={!!editingTranscriptItem}
        onOpenChange={(open) => !open && setEditingTranscriptItem(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Encrypted Transcript</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Transcripts are encrypted using your browser-held vault key before being saved.
            </p>
            <textarea
              value={transcriptValue}
              onChange={(e) => setTranscriptValue(e.target.value)}
              rows={6}
              placeholder="Type or paste recording transcript here..."
              className="input resize-none text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTranscriptItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTranscript} disabled={updateTranscript.isPending}>
              Save Transcript
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteCandidate} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <DialogTitle>Delete Voice Note</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">{deleteCandidate?.title}</span>? Both
            the encrypted audio recording and transcript will be permanently erased.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteCandidate(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteCandidate) {
                  await remove.mutateAsync(deleteCandidate);
                  setDeleteCandidate(null);
                }
              }}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
