# SafeVault AI — Private Secure Document & Credential Vault

SafeVault AI is a zero-knowledge personal vault and document intelligence system built with React 19, TypeScript, TanStack Router/Start, Tailwind CSS, Supabase, and authenticated Web Crypto encryption.

---

## 1. Architecture Overview

### 1.1 Technical Stack

- **Frontend & Routing**: React 19, TypeScript, TanStack Router (file-based routing), TanStack Query, Tailwind CSS, Radix UI & shadcn/ui.
- **Backend & Functions**: TanStack Start server functions (`src/lib/ai.functions.ts`).
- **Database & Auth**: Supabase PostgreSQL with strict Row Level Security (RLS) on all user tables, Supabase GoTrue Auth with JWTs.
- **Storage**: Private Supabase Storage buckets (`documents`, `voice-notes`) with user-isolated RLS storage policies.
- **Client-Side Cryptography**: Authenticated AES-256-GCM encryption with 96-bit unique nonces per payload and PBKDF2 (310,000 iterations, SHA-256) key derivation in browser memory.
- **AI & RAG Engine**: Vercel AI SDK integration supporting document extraction and grounded Q&A with clickable source citations.

---

## 2. Security Boundaries & Zero-Knowledge Architecture

SafeVault strictly differentiates between security layers:

1. **Transport Layer (HTTPS)**: Encrypts network traffic between client and server.
2. **Platform Layer (Database & Storage Volume Encryption)**: Supabase encrypts underlying persistent volumes at rest.
3. **Application Zero-Knowledge Vault Layer**:
   - Master passphrase derives an AES-256-GCM `CryptoKey` directly in browser memory via Web Crypto PBKDF2.
   - Passwords, notes, voice recordings, and chat threads are encrypted on the device before transmission to the database or storage.
   - The server stores only ciphertext and random nonces.
   - The vault lock status is separate from the user authentication session; locking the vault discards the decryption key from memory.
4. **AI Privacy Boundary**:
   - Passwords and credentials are **strictly excluded** from all AI prompts, embeddings, and context payloads.
   - Notes and voice transcripts require explicit user opt-in (`ai_indexing_enabled`) before being made available to the RAG context.
   - The assistant only answers using verified context and displays clickable citation badges.
5. **Key Management & KMS**:
   - In production, envelope encryption can be delegated to AWS KMS for master key management.
   - In development/local environments, Web Crypto PBKDF2 operates client-side with zero external key management overhead.

---

## 3. Getting Started

### 3.1 Prerequisites

- Node.js (v18+ or v20+)
- npm or pnpm
- A Supabase project with database migrations applied

### 3.2 Environment Setup

Copy the environment template and configure your Supabase instance:

```bash
cp .env.example .env
```

Ensure your `.env` contains:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
LOVABLE_API_KEY=your-ai-gateway-or-openai-key  # Optional for AI features
```

### 3.3 Installation & Migrations

Install dependencies:

```bash
npm install --legacy-peer-deps
```

Apply database migrations:
All database migrations are located under `drizzle/migrations/`:

- `0000_safevault_schema.sql`: Core schema (profiles, documents, activity_log).
- `0001_safevault_private_vault.sql`: Private vault tables (passwords, notes, voice notes, chat sessions, messages).
- `0002_safevault_indexes_and_extensions.sql`: Performance indexes and document encryption nonce support.

Run database migrations via Drizzle:

```bash
npm run db:push
```

### 3.4 Running Locally

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 4. Testing & Verification

Run the automated test suite:

```bash
npm test
```

Run TypeScript verification:

```bash
npx tsc --noEmit
```

Run ESLint verification:

```bash
npm run lint
```

Build for production:

```bash
npm run build
```

---

## 5. Application Routes

- `/`: Landing page and overview.
- `/login`: Secure user authentication and sign-in.
- `/register`: User onboarding and account creation.
- `/forgot-password`: Account recovery and password reset.
- `/dashboard`: Unified dashboard with live vault statistics and expiry alerts.
- `/documents`: Document management, filtering, and search.
- `/documents/$id`: Document viewer, inline expiry editor, metadata editor, and decrypted preview.
- `/upload`: Secure document upload with optional client-side AES-256-GCM encryption.
- `/passwords`: Zero-knowledge password vault, generator, and strength analysis.
- `/notes`: Encrypted notes vault with autosave and tag filtering.
- `/voice-notes`: In-browser audio recorder, encrypted audio storage, and transcripts.
- `/ask`: Persistent grounded AI chat with multi-session history and citations.
- `/reminders`: Expiry tracking with user-defined threshold filters and inline date edits.
- `/security`: Technical Security Center with transparent boundary explanations and audit logs.
- `/settings`: Profile management, vault lock/unlock, passphrase update, storage usage breakdown, secure export, and account deletion.
