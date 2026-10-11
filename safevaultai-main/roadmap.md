# SafeVault AI — Implementation Checklist & Roadmap

## 1. Environment & Baseline Stability

- [x] Audit dependencies, resolve peer dependency tree, install packages cleanly.
- [x] Fix baseline TypeScript and ESLint typing/syntax errors.
- [x] Create `.env.example` template covering Supabase, AI API, and AWS KMS variables.

## 2. Database Schema & Row-Level Security (RLS)

- [x] Forward-only migration `0002_safevault_indexes_and_extensions.sql` created and verified.
- [x] Added `file_nonce` to `documents` table for client-side document encryption support.
- [x] Performance indexes added across `password_entries`, `notes`, `voice_notes`, and `activity_log`.
- [x] RLS policies audited and validated across all 8 user tables: `profiles`, `documents`, `password_entries`, `notes`, `voice_notes`, `chat_sessions`, `chat_messages`, `activity_log`.

## 3. Cryptography & Key Management Architecture

- [x] Implemented Web Crypto PBKDF2 (310,000 iterations) key derivation with SHA-256.
- [x] Standardized AES-256-GCM authenticated encryption with 96-bit unique nonces per payload.
- [x] Cryptographically secure password generator using `crypto.getRandomValues()` with uniform rejection sampling.
- [x] NIST-aligned password strength scoring algorithm with actionable feedback.
- [x] Built `<VaultKeyProvider>` and `<VaultGate>` decoupling authenticated user sessions from unlocked in-memory vault state.
- [x] Unit tests for cryptographic round-trips, nonce uniqueness, and tampering rejection (13/13 passing).

## 4. Vault Navigation & App Shell

- [x] Expanded `AppShell` navigation with Passwords, Notes, Voice Notes, and interactive Vault Lock/Unlock status badge.
- [x] Ensured mobile drawer responsive navigation supports all vault views seamlessly.
- [x] Preserved Lovable visual design tokens, cards, and typography.

## 5. Passwords Vault (`/passwords`)

- [x] Interactive CRUD with client-side AES-256-GCM encryption at rest.
- [x] Category filtering (All, Social, Work, Finance, Other) and Favorites filter.
- [x] Real-time password strength meter and customizable generator modal.
- [x] Secure password reveal toggle and single-click clipboard copy with feedback.
- [x] Strict exclusion of passwords from AI indexing and search endpoints.

## 6. Notes Vault (`/notes`)

- [x] Client-side AES-256-GCM encryption at rest.
- [x] Debounced autosave with visual status ("Saving...", "Saved", "Error") and race condition protection.
- [x] Category filtering and multi-tag chip filtering.
- [x] Opt-in AI indexing toggle per note (`ai_indexing_enabled`).
- [x] Deletion with confirmation modal.

## 7. Voice Notes Vault (`/voice-notes`)

- [x] In-browser `MediaRecorder` audio capture (start, pause, resume, stop) with duration timer.
- [x] Audio file upload support (up to 25MB).
- [x] Client-side AES-256-GCM encryption before upload to private Supabase storage.
- [x] Decrypted in-browser audio playback with audio controls.
- [x] Transcript editing with opt-in AI indexing toggle (`ai_indexing_enabled`).
- [x] Deletion modal with cleanup of storage blobs and database records.

## 8. Persistent AI Chat & Grounded RAG (`/ask`)

- [x] Multi-session conversation sidebar (create new chat, switch sessions, delete session).
- [x] Client-side encrypted message persistence (`chat_messages`).
- [x] Grounded RAG retriever querying user's documents and explicitly opted-in notes/transcripts.
- [x] Verified zero passwords in AI retrieval prompts.
- [x] Interactive citation badges with clickable document detail links.
- [x] Anti-hallucination guardrails and honest degradation when external AI keys are unconfigured.

## 9. Documents & Dashboard Integration

- [x] Dashboard connected to live `useVaultStats` aggregated across all vaults.
- [x] Strictly nullable expiry date handling without inferring or fabricating dates.
- [x] Document detail view updated with inline expiry date editing, metadata editing, and secure decrypted preview.
- [x] Document upload flow updated with optional client-side AES-256-GCM encryption.

## 10. Reminders, Security Center & Settings

- [x] Reminders view (`/reminders`) updated with user reminder threshold filtering (`reminder_days`) and inline expiry editing.
- [x] Security Center (`/security`) audited: removed misleading claims; transparently clarified HTTPS vs DB encryption vs Client-Side AES-GCM vs KMS vs RLS.
- [x] Settings (`/settings`) updated with Vault lock/unlock controls, passphrase updates, storage breakdown, secure JSON export, and account deletion workflow.

## 11. Verification & Quality Assurance

- [x] Vitest test suite passing (13/13 unit tests).
- [x] TypeScript type checking (`npx tsc --noEmit`) passes with 0 errors.
- [x] ESLint validation passes cleanly.
- [x] Production build (`npm run build`) compiles successfully.
