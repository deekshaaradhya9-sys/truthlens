# TruthLens — Evidence, not verdicts.

**INNOVEDGE Hackathon 2026 (Problem Statement 04)**  
A multimodal digital forensics workbench that inspects images, video keyframes, audio spectra, and caption claims to surface explainable forensic indicators, calibrated confidence ranges, cross-modal contradiction graphs, tamper-evident SHA-256 chain-of-custody ledgers, multilingual voice investigation, and a real-time WebSocket peer calibration loop.

> **Golden Rule**: A score is an indicator, not a verdict. TruthLens never outputs "fake" or "real". Every report states a Risk Level (`Low` / `Medium` / `High`), a calibrated confidence range, methodological limitations, and plausible alternative innocent explanations.

---

## Core Features

1. **Evidence Lab (Ingest + Explainable Signals)**
   - **Image**: Error Level Analysis (ELA) heatmap (`sharp`) with interactive Original vs. ELA wipe/blend slider, EXIF/GPS/Software inspection (`exifr`), centered 2D DFT frequency-spectrum visualization, and 64-bit perceptual dHash.
   - **Video**: Client-side 8-frame extraction via HTML5 `<video>` + `<canvas>` with frame-to-frame luminance delta anomaly detection and suspicious frame timestamps.
   - **Audio**: Client-side Web Audio API Hann-windowed FFT spectrogram + server PCM energy/discontinuity detection + Gemini `gemini-2.5-flash` synthetic-speech indicator & transcript analysis.
   - **Text**: Cross-modal claim verification of captions/transcripts against visual, acoustic, and metadata anchors.

2. **Contradiction Graph, PDF Dossier & Chain of Custody**
   - **Interactive Force Graph** (`react-force-graph-2d`) connecting Evidence, Claims, and Metadata nodes via Green (`corroborates`), Red (`contradicts`), and Amber (`inconclusive`) edges. Clicking any edge opens the supporting evidence drawer.
   - **Exportable PDF Forensic Dossier** (`jspdf`) with calibrated confidence, indicators, source trace, custody proof, limitations, and recommended human checks.
   - **Tamper-Evident SHA-256 Ledger**: Original uploads are stored immutably outside the web root (`./data/uploads/`). Every ingest/analysis appends a hash-chained block (`entryHash = SHA256(prevEntryHash | caseId | evidenceId | action | fileSha256 | timestamp)`). Clicking **Verify Ledger** recomputes the entire chain and re-hashes every original file on disk.

3. **Multilingual Voice Forensic Agent**
   - Powered by server-side Gemini `gemini-2.5-flash`, grounded strictly on the stored case report (zero invented facts).
   - Supports **English, Hindi, Kannada, Tamil, and Telugu** via browser `speechSynthesis` (narration) and `SpeechRecognition` (voice follow-ups).
   - **Devil's Advocate Mode**: Argues the strongest plausible innocent explanation for every flag and specifies what external evidence would settle the discrepancy.

4. **Real-Time Community Peer Calibration Loop**
   - WebSocket-backed (`ws`) peer consensus panel backed by SQLite (`community_votes`) where investigators broadcast calibrated stances (`Plausible Artifact`, `Needs Corroboration`, `Likely Benign`) with evidence rationales.

---

## Quick Start & Setup

### 1. Configure Environment Variables
Copy `.env.example` to `.env` and populate secrets (never commit `.env` to Git):

```bash
cp .env.example .env
```

Required variables:
- `GEMINI_API_KEY`: Google Gemini API key (free tier `gemini-2.5-flash`).
- `SESSION_SECRET`: Random secret >= 32 characters (required when `NODE_ENV=production`).
- `PORT`: Server port (default `3000`).

### 2. Install Dependencies & Run
```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Click **Inspect Seeded Demo Case** (or create an investigator account) to explore the pre-seeded Mumbai/Bengaluru contradiction case.

### 3. Production Build & Start
```bash
npm run build
NODE_ENV=production npm start
```

---

## Security Architecture Highlights

- **Secrets Isolation**: `GEMINI_API_KEY` and `SESSION_SECRET` reside strictly on the server; `.env*` and `data/` are excluded in `.gitignore`.
- **Authentication & Sessions**: Passwords hashed with `argon2id`; `httpOnly`, `SameSite=Lax`, `Secure` (on HTTPS/prod) session cookies; 24-hour expiry; CSRF token (`X-CSRF-Token`) + same-origin check on mutating routes.
- **Authorization (IDOR & RBAC)**: All case/file/report/ledger queries filter by `userId = req.user.id`. Admin endpoints enforce `req.user.role === 'admin'` server-side. No default admin credentials are seeded.
- **Upload Hardening**: 15 MB limit, MIME allowlist, binary magic-byte inspection, random UUID filenames stored outside public web root (`./data/uploads/`), streamed with `X-Content-Type-Options: nosniff`.
- **XSS & Headers**: Zero `dangerouslySetInnerHTML`; text sanitized with `isomorphic-dompurify`; strict `Content-Security-Policy`, `X-Frame-Options: DENY`, `HSTS`, `Referrer-Policy`, and `Permissions-Policy: microphone=(self)`.
- **Prompt-Injection Defence**: Untrusted captions, filenames, and metadata are isolated inside `<untrusted_evidence_data>` blocks with explicit non-instruction system directives.

---

## Project Roadmap

- **Phase 1 (Hackathon MVP — Complete)**: Image ELA/EXIF/FFT/dHash, 8-frame client video extraction, Web Audio FFT spectrogram, Gemini `gemini-2.5-flash` cross-modal synthesis, interactive contradiction graph, PDF export, SHA-256 custody ledger, 5-language voice agent with Devil's Advocate, and real-time WebSocket community voting.
- **Phase 2 (Provenance & C2PA)**: Hardware-signed C2PA Content Credentials verification and perceptual-hash similarity search across prior verified cases.
- **Phase 3 (Collaborative Case Rooms)**: Encrypted organization workspaces with peer-review audit trails and multi-investigator live graph annotations.
