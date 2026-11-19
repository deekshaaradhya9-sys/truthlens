import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('investigator'),
  isDemoUser: integer('is_demo_user').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  csrfToken: text('csrf_token').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const cases = sqliteTable('cases', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  captionText: text('caption_text').notNull().default(''),
  isDemoSeed: integer('is_demo_seed').notNull().default(0),
  riskLevel: text('risk_level').notNull().default('Medium'),
  confidenceMin: integer('confidence_min').notNull().default(40),
  confidenceMax: integer('confidence_max').notNull().default(70),
  summary: text('summary').notNull().default(''),
  limitationsJson: text('limitations_json').notNull().default('[]'),
  alternativesJson: text('alternatives_json').notNull().default('[]'),
  recommendedChecksJson: text('recommended_checks_json').notNull().default('[]'),
  analysisMode: text('analysis_mode').notNull().default('hybrid_ai'),
  correlationsJson: text('correlations_json').notNull().default('[]'),
  manipulationJson: text('manipulation_json').notNull().default('[]'),
  analysisStale: integer('analysis_stale').notNull().default(0),
  humanReviewJson: text('human_review_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const evidenceItems = sqliteTable('evidence_items', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  modality: text('modality').notNull(), // 'image' | 'video' | 'audio' | 'text'
  originalFilename: text('original_filename').notNull(),
  storedFilename: text('stored_filename'),
  elaFilename: text('ela_filename'),
  fftFilename: text('fft_filename'),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(),
  perceptualHash: text('perceptual_hash'),
  exifJson: text('exif_json'),
  metricsJson: text('metrics_json'),
  framesJson: text('frames_json'),
  transcript: text('transcript'),
  createdAt: integer('created_at').notNull(),
});

export const findings = sqliteTable('findings', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  evidenceId: text('evidence_id'),
  modality: text('modality').notNull(),
  indicator: text('indicator').notNull(),
  whyFlagged: text('why_flagged').notNull(),
  locationOrTimestamp: text('location_or_timestamp').notNull(),
  confidenceRange: text('confidence_range').notNull(),
  limitation: text('limitation').notNull(),
  severity: text('severity').notNull().default('Medium'),
  createdAt: integer('created_at').notNull(),
});

export const graphNodes = sqliteTable('graph_nodes', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  nodeKey: text('node_key').notNull(),
  label: text('label').notNull(),
  nodeType: text('node_type').notNull(), // 'evidence' | 'claim' | 'metadata'
  modality: text('modality').notNull(),
  details: text('details').notNull(),
});

export const graphEdges = sqliteTable('graph_edges', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  sourceKey: text('source_key').notNull(),
  targetKey: text('target_key').notNull(),
  relation: text('relation').notNull(), // 'corroborates' | 'contradicts' | 'inconclusive'
  label: text('label').notNull(),
  explanation: text('explanation').notNull(),
  confidenceRange: text('confidence_range').notNull(),
  limitation: text('limitation').notNull(),
});

export const custodyLedger = sqliteTable('custody_ledger', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  entryIndex: integer('entry_index').notNull(),
  evidenceId: text('evidence_id'),
  action: text('action').notNull(),
  fileSha256: text('file_sha256').notNull(),
  prevEntryHash: text('prev_entry_hash').notNull(),
  entryHash: text('entry_hash').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const agentMessages = sqliteTable('agent_messages', {
  id: text('id').primaryKey(),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant'
  language: text('language').notNull().default('en'),
  devilsAdvocate: integer('devils_advocate').notNull().default(0),
  content: text('content').notNull(),
  citedFindingIdsJson: text('cited_finding_ids_json').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
});

export const communityVotes = sqliteTable('community_votes', {
  id: text('id').primaryKey(),
  topicKey: text('topic_key').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  voterName: text('voter_name').notNull(),
  stance: text('stance').notNull(), // 'plausible_artifact' | 'needs_corroboration' | 'likely_benign'
  rationale: text('rationale').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  ipHash: text('ip_hash').notNull(),
  details: text('details').notNull(),
  createdAt: integer('created_at').notNull(),
});
