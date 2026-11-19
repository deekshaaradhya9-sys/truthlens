import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.ts';

// Store database and uploaded originals strictly outside the web/dist root
export const DATA_ROOT = path.resolve(process.cwd(), 'data');
export const DB_DIR = path.join(DATA_ROOT, 'db');
export const UPLOADS_DIR = path.join(DATA_ROOT, 'uploads');
export const ELA_DIR = path.join(DATA_ROOT, 'ela');
export const SEED_DIR = path.join(DATA_ROOT, 'seed');

for (const dir of [DATA_ROOT, DB_DIR, UPLOADS_DIR, ELA_DIR, SEED_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'truthlens.sqlite');
export const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Initialize tables with strict schema constraints
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'investigator',
    is_demo_user INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    csrf_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    caption_text TEXT NOT NULL DEFAULT '',
    is_demo_seed INTEGER NOT NULL DEFAULT 0,
    risk_level TEXT NOT NULL DEFAULT 'Medium',
    confidence_min INTEGER NOT NULL DEFAULT 40,
    confidence_max INTEGER NOT NULL DEFAULT 70,
    summary TEXT NOT NULL DEFAULT '',
    limitations_json TEXT NOT NULL DEFAULT '[]',
    alternatives_json TEXT NOT NULL DEFAULT '[]',
    recommended_checks_json TEXT NOT NULL DEFAULT '[]',
    analysis_mode TEXT NOT NULL DEFAULT 'hybrid_ai',
    correlations_json TEXT NOT NULL DEFAULT '[]',
    manipulation_json TEXT NOT NULL DEFAULT '[]',
    analysis_stale INTEGER NOT NULL DEFAULT 0,
    human_review_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evidence_items (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    modality TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT,
    ela_filename TEXT,
    fft_filename TEXT,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    perceptual_hash TEXT,
    exif_json TEXT,
    metrics_json TEXT,
    frames_json TEXT,
    transcript TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    evidence_id TEXT,
    modality TEXT NOT NULL,
    indicator TEXT NOT NULL,
    why_flagged TEXT NOT NULL,
    location_or_timestamp TEXT NOT NULL,
    confidence_range TEXT NOT NULL,
    limitation TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'Medium',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    node_key TEXT NOT NULL,
    label TEXT NOT NULL,
    node_type TEXT NOT NULL,
    modality TEXT NOT NULL,
    details TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    source_key TEXT NOT NULL,
    target_key TEXT NOT NULL,
    relation TEXT NOT NULL,
    label TEXT NOT NULL,
    explanation TEXT NOT NULL,
    confidence_range TEXT NOT NULL,
    limitation TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custody_ledger (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_index INTEGER NOT NULL,
    evidence_id TEXT,
    action TEXT NOT NULL,
    file_sha256 TEXT NOT NULL,
    prev_entry_hash TEXT NOT NULL,
    entry_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    devils_advocate INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    cited_finding_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS community_votes (
    id TEXT PRIMARY KEY,
    topic_key TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    voter_name TEXT NOT NULL,
    stance TEXT NOT NULL,
    rationale TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    ip_hash TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cases_user ON cases(user_id);
  CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence_items(case_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_findings_case ON findings(case_id);
  CREATE INDEX IF NOT EXISTS idx_ledger_case ON custody_ledger(case_id, entry_index);
  CREATE INDEX IF NOT EXISTS idx_votes_topic ON community_votes(topic_key);
  CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at);
`);

// Non-destructive additive column migrations preserving all existing SQLite case data
const existingCaseCols = sqlite.prepare('PRAGMA table_info(cases)').all() as Array<{ name: string }>;
const existingCaseColNames = new Set(existingCaseCols.map((c) => c.name));
if (!existingCaseColNames.has('analysis_mode')) {
  sqlite.exec("ALTER TABLE cases ADD COLUMN analysis_mode TEXT NOT NULL DEFAULT 'hybrid_ai'");
}
if (!existingCaseColNames.has('correlations_json')) {
  sqlite.exec("ALTER TABLE cases ADD COLUMN correlations_json TEXT NOT NULL DEFAULT '[]'");
}
if (!existingCaseColNames.has('manipulation_json')) {
  sqlite.exec("ALTER TABLE cases ADD COLUMN manipulation_json TEXT NOT NULL DEFAULT '[]'");
}
if (!existingCaseColNames.has('analysis_stale')) {
  sqlite.exec("ALTER TABLE cases ADD COLUMN analysis_stale INTEGER NOT NULL DEFAULT 0");
}
if (!existingCaseColNames.has('human_review_json')) {
  sqlite.exec("ALTER TABLE cases ADD COLUMN human_review_json TEXT NOT NULL DEFAULT '{}'");
}

export const db = drizzle(sqlite, { schema });
