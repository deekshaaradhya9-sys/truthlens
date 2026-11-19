import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { WebSocketServer, WebSocket } from 'ws';
import { and, asc, desc, eq } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';

import { env } from './server/env.ts';
import { db, ELA_DIR, UPLOADS_DIR } from './server/db/index.ts';
import {
  agentMessages,
  auditLogs,
  cases,
  communityVotes,
  custodyLedger,
  evidenceItems,
  findings,
  graphEdges,
  graphNodes,
  users,
} from './server/db/schema.ts';
import {
  type AuthedRequest,
  createUserSession,
  destroySession,
  hashPassword,
  requireAdmin,
  requireAuth,
  requireCsrf,
  resolveSessionUser,
  verifyPassword,
  verifySameOrigin,
} from './server/security/auth.ts';
import { recordAuditEvent } from './server/security/audit.ts';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_UPLOAD_TYPES,
  normalizeMimeType,
  sanitizeFilename,
  sanitizeText,
  verifyMagicBytes,
} from './server/security/sanitize.ts';
import { analyzeImageBuffer } from './server/forensics/imageAnalyzer.ts';
import { analyzeAudioBuffer } from './server/forensics/audioAnalyzer.ts';
import { analyzeDocumentBuffer } from './server/forensics/documentAnalyzer.ts';
import { analyzeVideoBuffer } from './server/forensics/videoAnalyzer.ts';
import {
  runDeterministicCrossModalEngine,
  type CrossModalCorrelationItem,
  type ManipulationIndicatorItem,
} from './server/forensics/crossModalCorrelator.ts';
import { appendCustodyEntry, computeSha256, verifyCaseLedger } from './server/forensics/ledger.ts';
import {
  analyzeCaseWithGemini,
  buildDeterministicAgentBriefing,
  runForensicAgentChat,
  type StoredReportContext,
} from './server/forensics/geminiForensics.ts';
import {
  PUBLIC_BENCHMARK_TOPIC,
  ensureCommunitySeedVotes,
  provisionDemoCaseForUser,
} from './server/seed/demoSeeder.ts';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Block dotfiles and sensitive paths immediately (allow Vite's internal .vite deps only in dev)
app.use((req, res, next) => {
  const segments = req.path.split('/').filter(Boolean);
  const isDevViteAsset = !env.isProd && req.path.startsWith('/node_modules/.vite/');
  if (!isDevViteAsset && segments.some((seg) => seg.startsWith('.'))) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  next();
});

// Strict security headers & CSP (permits embedding only in Google AI Studio preview iframe)
const allowedFrameAncestors = [
  "'self'",
  'https://aistudio.google.com',
  'https://*.googleusercontent.com',
  'https://*.usercontent.goog',
];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: env.isProd ? ["'self'"] : ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: allowedFrameAncestors,
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    xFrameOptions: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
);

app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// Rate limiters (per-IP & per-user)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please wait before trying again.' },
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => {
    const authed = req as AuthedRequest;
    return authed.user?.id ? `user:${authed.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '127.0.0.1')}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload rate limit exceeded. Try again shortly.' },
});

const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 25,
  keyGenerator: (req) => {
    const authed = req as AuthedRequest;
    return authed.user?.id ? `user:${authed.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '127.0.0.1')}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI analysis rate limit exceeded. Try again shortly.' },
});

// Multer memory storage with strict 15 MB file limit and Chromebook-friendly generic MIME fallback
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1,
    fieldSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const normMime = normalizeMimeType(file.mimetype);
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isGenericMime = normMime === '' || normMime === 'application/octet-stream';
    if (normMime in ALLOWED_UPLOAD_TYPES || (isGenericMime && ALLOWED_EXTENSIONS.has(ext))) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file format (${normMime || ext || 'unknown'}). Allowed: JPEG, PNG, WebP, WAV, MP3, M4A, OGG, MP4, WebM, PDF, TXT.`,
        ),
      );
    }
  },
});

// Zod schemas
const signupSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(60),
});

const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(128),
});

const createCaseSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().max(600).optional().default(''),
  captionText: z.string().max(3000).optional().default(''),
});

const updateCaptionSchema = z.object({
  captionText: z.string().max(3000),
});

const videoFrameSchema = z.object({
  timestampSec: z.number().min(0).max(36000),
  deltaScore: z.number().min(0).max(100),
  suspicious: z.boolean(),
  thumbnailDataUrl: z
    .string()
    .max(220000)
    .refine((v) => v.startsWith('data:image/jpeg;base64,'), 'Must be JPEG data URL'),
});

const videoMetaSchema = z.object({
  durationSec: z.number().min(0).max(36000).nullable().optional(),
  width: z.number().int().min(0).max(16000).nullable().optional(),
  height: z.number().int().min(0).max(16000).nullable().optional(),
  hasAudioTrack: z.boolean().nullable().optional(),
  audioSyncNote: z.string().max(300).nullable().optional(),
});

const agentChatSchema = z.object({
  question: z.string().min(1).max(1000),
  language: z.enum(['en', 'hi', 'kn', 'ta', 'te']).default('en'),
  devilsAdvocate: z.boolean().default(false),
});

const communityVoteSchema = z.object({
  topicKey: z.string().min(2).max(80).default(PUBLIC_BENCHMARK_TOPIC),
  stance: z.enum(['plausible_artifact', 'needs_corroboration', 'likely_benign']),
  rationale: z.string().min(3).max(400),
});

const humanReviewSchema = z.object({
  status: z.enum(['pending', 'verified_corroborated', 'verified_inconclusive', 'escalated']),
  reviewerNote: z.string().max(1500).default(''),
  checkedItems: z.array(z.string().max(400)).max(25).default([]),
  findingDecisions: z
    .record(z.string().max(80), z.enum(['corroborated', 'benign_artifact', 'needs_followup']))
    .default({}),
});

// Helper: load full case payload scoped strictly to userId
async function loadFullCaseForUser(caseId: string, userId: string) {
  const caseRows = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, userId)))
    .limit(1);

  if (caseRows.length === 0) return null;
  const c = caseRows[0];

  const [evRows, findingRows, nodeRows, edgeRows, ledgerRows, msgRows] = await Promise.all([
    db
      .select()
      .from(evidenceItems)
      .where(and(eq(evidenceItems.caseId, caseId), eq(evidenceItems.userId, userId)))
      .orderBy(asc(evidenceItems.createdAt)),
    db.select().from(findings).where(eq(findings.caseId, caseId)).orderBy(asc(findings.createdAt)),
    db.select().from(graphNodes).where(eq(graphNodes.caseId, caseId)),
    db.select().from(graphEdges).where(eq(graphEdges.caseId, caseId)),
    db
      .select()
      .from(custodyLedger)
      .where(and(eq(custodyLedger.caseId, caseId), eq(custodyLedger.userId, userId)))
      .orderBy(asc(custodyLedger.entryIndex)),
    db
      .select()
      .from(agentMessages)
      .where(and(eq(agentMessages.caseId, caseId), eq(agentMessages.userId, userId)))
      .orderBy(asc(agentMessages.createdAt)),
  ]);

  const safeJson = <T>(raw: string | null | undefined, fallback: T): T => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  const safeArray = <T>(raw: string | null | undefined): T[] => {
    const parsed = safeJson<unknown>(raw, []);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  };

  const storedCorrelations = safeArray<CrossModalCorrelationItem>(c.correlationsJson);
  const storedManipulation = safeArray<ManipulationIndicatorItem>(c.manipulationJson);
  let correlations = storedCorrelations;
  let manipulationIndicators = storedManipulation;

  if (
    (correlations.length === 0 || manipulationIndicators.length === 0) &&
    (evRows ?? []).length > 0
  ) {
    const computed = runDeterministicCrossModalEngine({
      caseTitle: c.title,
      captionText: c.captionText,
      evidenceRows: evRows ?? [],
    });
    if (correlations.length === 0) correlations = computed.correlations;
    if (manipulationIndicators.length === 0) {
      manipulationIndicators = computed.manipulationIndicators;
    }
  }

  const rawReview = safeJson<Record<string, unknown>>(c.humanReviewJson, {});
  const humanReview = {
    status:
      rawReview.status === 'verified_corroborated' ||
      rawReview.status === 'verified_inconclusive' ||
      rawReview.status === 'escalated'
        ? rawReview.status
        : 'pending',
    reviewerNote: typeof rawReview.reviewerNote === 'string' ? rawReview.reviewerNote : '',
    checkedItems: Array.isArray(rawReview.checkedItems)
      ? rawReview.checkedItems.filter((x): x is string => typeof x === 'string')
      : [],
    findingDecisions:
      rawReview.findingDecisions && typeof rawReview.findingDecisions === 'object'
        ? (rawReview.findingDecisions as Record<string, 'corroborated' | 'benign_artifact' | 'needs_followup'>)
        : {},
    signedOffBy: typeof rawReview.signedOffBy === 'string' ? rawReview.signedOffBy : null,
    signedOffAt: typeof rawReview.signedOffAt === 'number' ? rawReview.signedOffAt : null,
  };

  return {
    case: {
      id: c.id,
      title: c.title,
      description: c.description,
      captionText: c.captionText,
      isDemoSeed: c.isDemoSeed === 1,
      riskLevel: c.riskLevel as 'Low' | 'Medium' | 'High',
      confidenceMin: c.confidenceMin,
      confidenceMax: c.confidenceMax,
      summary: c.summary,
      analysisMode: (c.analysisMode || 'hybrid_ai') as 'hybrid_ai' | 'deterministic_heuristics',
      analysisStale: c.analysisStale === 1,
      humanReview,
      limitations: safeArray<string>(c.limitationsJson),
      alternativeExplanations: safeArray<string>(c.alternativesJson),
      recommendedChecks: safeArray<string>(c.recommendedChecksJson),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    },
    evidence: (evRows ?? []).map((ev) => ({
      id: ev.id,
      modality: ev.modality,
      originalFilename: ev.originalFilename,
      hasFile: Boolean(ev.storedFilename),
      hasEla: Boolean(ev.elaFilename),
      hasFft: Boolean(ev.fftFilename),
      mimeType: ev.mimeType,
      byteSize: ev.byteSize,
      sha256: ev.sha256,
      perceptualHash: ev.perceptualHash,
      exif: safeJson(ev.exifJson, null),
      metrics: safeJson(ev.metricsJson, null),
      frames: ev.framesJson ? safeArray(ev.framesJson) : null,
      transcript: ev.transcript,
      createdAt: ev.createdAt,
    })),
    findings: findingRows ?? [],
    correlations,
    manipulationIndicators,
    graph: {
      nodes: nodeRows ?? [],
      edges: edgeRows ?? [],
    },
    ledger: ledgerRows ?? [],
    agentMessages: (msgRows ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      language: m.language,
      devilsAdvocate: m.devilsAdvocate === 1,
      content: m.content,
      citedFindingIds: safeArray<string>(m.citedFindingIdsJson),
      createdAt: m.createdAt,
    })),
  };
}

// --- WebSocket server for real-time community calibration loop ---
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws/community' });

function broadcastCommunityUpdate(topicKey: string, payload: unknown) {
  const message = JSON.stringify({ type: 'vote:updated', topicKey, data: payload });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

async function getCommunitySummary(topicKey: string) {
  const rows = await db
    .select()
    .from(communityVotes)
    .where(eq(communityVotes.topicKey, topicKey))
    .orderBy(desc(communityVotes.createdAt))
    .limit(40);

  const counts = {
    plausible_artifact: 0,
    needs_corroboration: 0,
    likely_benign: 0,
  };
  for (const r of rows) {
    if (r.stance === 'plausible_artifact') counts.plausible_artifact += 1;
    else if (r.stance === 'needs_corroboration') counts.needs_corroboration += 1;
    else if (r.stance === 'likely_benign') counts.likely_benign += 1;
  }

  return {
    topicKey,
    totalVotes: rows.length,
    counts,
    recentVotes: rows.map((r) => ({
      id: r.id,
      voterName: r.voterName,
      stance: r.stance,
      rationale: r.rationale,
      createdAt: r.createdAt,
    })),
  };
}

// --- Auth Endpoints ---
app.get('/api/auth/me', async (req, res) => {
  const resolved = await resolveSessionUser(req);
  if (!resolved) {
    res.json({ authenticated: false, user: null, csrfToken: null });
    return;
  }
  res.json({
    authenticated: true,
    user: resolved.user,
    csrfToken: resolved.csrfToken,
  });
});

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  if (!verifySameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin request blocked.' });
    return;
  }
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid signup fields. Password must be at least 8 characters.' });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const displayName = sanitizeText(parsed.data.displayName, 60);
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(parsed.data.password);
  const now = Date.now();

  await db.insert(users).values({
    id: userId,
    email,
    displayName,
    passwordHash,
    role: 'investigator', // Hardcoded non-privileged role on signup
    isDemoUser: 0,
    createdAt: now,
  });

  await provisionDemoCaseForUser(userId);
  await ensureCommunitySeedVotes(userId);

  const { csrfToken, sessionToken } = await createUserSession(res, req, userId);
  await recordAuditEvent({
    req,
    userId,
    action: 'AUTH_SIGNUP',
    resourceType: 'user',
    resourceId: userId,
    details: 'Investigator account registered',
  });
  res.status(201).json({
    user: { id: userId, email, displayName, role: 'investigator', isDemoUser: false },
    csrfToken,
    sessionToken,
  });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  if (!verifySameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin request blocked.' });
    return;
  }
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email or password format.' });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (rows.length === 0) {
    await recordAuditEvent({
      req,
      userId: null,
      action: 'AUTH_LOGIN_FAILED',
      resourceType: 'user',
      details: 'Failed login attempt (unknown email)',
    });
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  const user = rows[0];
  const valid = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!valid) {
    await recordAuditEvent({
      req,
      userId: user.id,
      action: 'AUTH_LOGIN_FAILED',
      resourceType: 'user',
      resourceId: user.id,
      details: 'Failed login attempt (password mismatch)',
    });
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  const { csrfToken, sessionToken } = await createUserSession(res, req, user.id);
  await recordAuditEvent({
    req,
    userId: user.id,
    action: 'AUTH_LOGIN',
    resourceType: 'user',
    resourceId: user.id,
    details: 'Investigator session authenticated',
  });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isDemoUser: user.isDemoUser === 1,
    },
    csrfToken,
    sessionToken,
  });
});

// Ephemeral isolated investigator demo session (no hardcoded credentials or shared IDOR)
app.post('/api/auth/demo', authLimiter, async (req, res) => {
  if (!verifySameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin request blocked.' });
    return;
  }
  const userId = crypto.randomUUID();
  const randomPassword = crypto.randomBytes(24).toString('hex');
  const passwordHash = await hashPassword(randomPassword);
  const shortTag = userId.slice(0, 6);
  const email = `demo-${shortTag}@truthlens.local`;
  const displayName = `Investigator ${shortTag.toUpperCase()}`;

  await db.insert(users).values({
    id: userId,
    email,
    displayName,
    passwordHash,
    role: 'investigator',
    isDemoUser: 1,
    createdAt: Date.now(),
  });

  await provisionDemoCaseForUser(userId);
  await ensureCommunitySeedVotes(userId);

  const { csrfToken, sessionToken } = await createUserSession(res, req, userId);
  await recordAuditEvent({
    req,
    userId,
    action: 'AUTH_DEMO',
    resourceType: 'user',
    resourceId: userId,
    details: 'Isolated demo investigator sandbox created',
  });
  res.status(201).json({
    user: { id: userId, email, displayName, role: 'investigator', isDemoUser: true },
    csrfToken,
    sessionToken,
  });
});

app.post('/api/auth/logout', requireAuth, requireCsrf, async (req: AuthedRequest, res) => {
  await recordAuditEvent({
    req,
    userId: req.user?.id ?? null,
    action: 'AUTH_LOGOUT',
    resourceType: 'session',
    details: 'Session terminated by user',
  });
  await destroySession(req, res);
  res.json({ ok: true });
});

// User-scoped Security Audit Log endpoint
app.get('/api/audit-logs', requireAuth, async (req: AuthedRequest, res) => {
  const logs = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, req.user!.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(40);
  res.json({ logs });
});

// Server-enforced Admin Route (/api/admin/overview)
app.get(
  '/api/admin/overview',
  requireAuth,
  async (req: AuthedRequest, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
      await recordAuditEvent({
        req,
        userId: req.user?.id ?? null,
        action: 'RBAC_DENIED',
        resourceType: 'admin_overview',
        details: `Non-admin role (${req.user?.role ?? 'none'}) denied access to /api/admin/overview`,
      });
    }
    next();
  },
  requireAdmin,
  async (_req, res) => {
    const allCases = await db.select().from(cases);
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users);
    const recentLogs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);
    res.json({
      totalUsers: allUsers.length,
      totalCases: allCases.length,
      users: allUsers,
      recentAuditLogs: recentLogs,
    });
  },
);

// --- Case Endpoints (Strictly User-Scoped) ---
app.get('/api/cases', requireAuth, async (req: AuthedRequest, res) => {
  const userCases = await db
    .select()
    .from(cases)
    .where(eq(cases.userId, req.user!.id))
    .orderBy(desc(cases.updatedAt));

  res.json({
    cases: userCases.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      isDemoSeed: c.isDemoSeed === 1,
      riskLevel: c.riskLevel,
      confidenceMin: c.confidenceMin,
      confidenceMax: c.confidenceMax,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
});

app.post('/api/cases', requireAuth, requireCsrf, async (req: AuthedRequest, res) => {
  const parsed = createCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid case title or description.' });
    return;
  }

  const caseId = crypto.randomUUID();
  const now = Date.now();
  const title = sanitizeText(parsed.data.title, 140);
  const description = sanitizeText(parsed.data.description, 600);
  const captionText = sanitizeText(parsed.data.captionText, 3000);

  await db.insert(cases).values({
    id: caseId,
    userId: req.user!.id,
    title,
    description,
    captionText,
    isDemoSeed: 0,
    riskLevel: 'Low',
    confidenceMin: 15,
    confidenceMax: 35,
    summary:
      'Case initialized. Upload image, video, audio, or caption claims and run forensic analysis to generate explainable indicators.',
    limitationsJson: JSON.stringify([
      'No multimodal signals evaluated yet. Upload evidence items and run analysis.',
    ]),
    alternativesJson: JSON.stringify([]),
    recommendedChecksJson: JSON.stringify(['Upload original unedited media files before sharing.']),
    createdAt: now,
    updatedAt: now,
  });

  if (captionText.length > 0) {
    const txtId = crypto.randomUUID();
    const sha = computeSha256(Buffer.from(captionText, 'utf8'));
    await db.insert(evidenceItems).values({
      id: txtId,
      caseId,
      userId: req.user!.id,
      modality: 'text',
      originalFilename: 'submitted_caption.txt',
      storedFilename: null,
      elaFilename: null,
      fftFilename: null,
      mimeType: 'text/plain',
      byteSize: Buffer.byteLength(captionText, 'utf8'),
      sha256: sha,
      transcript: captionText,
      createdAt: now,
    });
    await appendCustodyEntry({
      caseId,
      userId: req.user!.id,
      evidenceId: txtId,
      action: 'INGEST_ORIGINAL',
      fileSha256: sha,
      createdAt: now,
    });
  }

  await recordAuditEvent({
    req,
    userId: req.user!.id,
    action: 'CASE_CREATE',
    resourceType: 'case',
    resourceId: caseId,
    details: `Created case "${title}"`,
  });

  const full = await loadFullCaseForUser(caseId, req.user!.id);
  res.status(201).json(full);
});

app.get('/api/cases/:caseId', requireAuth, async (req: AuthedRequest, res) => {
  const full = await loadFullCaseForUser(String(req.params.caseId), req.user!.id);
  if (!full) {
    res.status(404).json({ error: 'Case not found.' });
    return;
  }
  res.json(full);
});

app.post('/api/cases/:caseId/caption', requireAuth, requireCsrf, async (req: AuthedRequest, res) => {
  const caseId = String(req.params.caseId);
  const owned = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, req.user!.id)))
    .limit(1);
  if (owned.length === 0) {
    res.status(404).json({ error: 'Case not found.' });
    return;
  }

  const parsed = updateCaptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid caption text.' });
    return;
  }

  const cleanCaption = sanitizeText(parsed.data.captionText, 3000);
  const now = Date.now();
  await db
    .update(cases)
    .set({ captionText: cleanCaption, updatedAt: now })
    .where(and(eq(cases.id, caseId), eq(cases.userId, req.user!.id)));

  const existingText = await db
    .select()
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.caseId, caseId),
        eq(evidenceItems.userId, req.user!.id),
        eq(evidenceItems.modality, 'text'),
      ),
    )
    .limit(1);

  const sha = computeSha256(Buffer.from(cleanCaption, 'utf8'));
  if (existingText.length > 0) {
    await db
      .update(evidenceItems)
      .set({
        transcript: cleanCaption,
        sha256: sha,
        byteSize: Buffer.byteLength(cleanCaption, 'utf8'),
      })
      .where(eq(evidenceItems.id, existingText[0].id));
    await appendCustodyEntry({
      caseId,
      userId: req.user!.id,
      evidenceId: existingText[0].id,
      action: 'CAPTION_UPDATED',
      fileSha256: sha,
      createdAt: now,
    });
  } else {
    const txtId = crypto.randomUUID();
    await db.insert(evidenceItems).values({
      id: txtId,
      caseId,
      userId: req.user!.id,
      modality: 'text',
      originalFilename: 'submitted_caption.txt',
      mimeType: 'text/plain',
      byteSize: Buffer.byteLength(cleanCaption, 'utf8'),
      sha256: sha,
      transcript: cleanCaption,
      createdAt: now,
    });
    await appendCustodyEntry({
      caseId,
      userId: req.user!.id,
      evidenceId: txtId,
      action: 'INGEST_ORIGINAL',
      fileSha256: sha,
      createdAt: now,
    });
  }

  const updatedEvRows = await db
    .select()
    .from(evidenceItems)
    .where(and(eq(evidenceItems.caseId, caseId), eq(evidenceItems.userId, req.user!.id)))
    .orderBy(asc(evidenceItems.createdAt));

  const detCap = runDeterministicCrossModalEngine({
    caseTitle: owned[0].title,
    captionText: cleanCaption,
    evidenceRows: updatedEvRows,
  });

  await db
    .update(cases)
    .set({
      correlationsJson: JSON.stringify(detCap.correlations),
      manipulationJson: JSON.stringify(detCap.manipulationIndicators),
      analysisStale: 1,
      updatedAt: now,
    })
    .where(and(eq(cases.id, caseId), eq(cases.userId, req.user!.id)));

  const full = await loadFullCaseForUser(caseId, req.user!.id);
  res.json(full);
});

// Upload image / audio / video / document evidence
app.post(
  '/api/cases/:caseId/evidence',
  requireAuth,
  requireCsrf,
  uploadLimiter,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({ error: 'File exceeds the 15 MB upload limit.' });
            return;
          }
          res.status(400).json({ error: `Upload error (${err.code}): ${err.message}` });
          return;
        }
        res.status(400).json({ error: err instanceof Error ? err.message : 'File upload rejected.' });
        return;
      }
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    const caseId = String(req.params.caseId);
    const owned = await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.userId, req.user!.id)))
      .limit(1);

    if (owned.length === 0) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No evidence file attached.' });
      return;
    }

    if (!file.buffer || file.buffer.length === 0) {
      res.status(400).json({ error: 'Uploaded file is empty (0 bytes).' });
      return;
    }

    const magicCheck = verifyMagicBytes(file.buffer, file.mimetype, file.originalname);
    if (!magicCheck.ok) {
      res.status(400).json({ error: magicCheck.reason });
      return;
    }

    const evidenceId = crypto.randomUUID();
    const randomStoredName = `${crypto.randomUUID()}${magicCheck.ext}`;
    const originalFilename = sanitizeFilename(file.originalname);
    const sha256 = computeSha256(file.buffer);
    const now = Date.now();

    // Write immutable original outside web root
    fs.writeFileSync(path.join(UPLOADS_DIR, randomStoredName), file.buffer);

    let elaFilename: string | null = null;
    let fftFilename: string | null = null;
    let perceptualHash: string | null = null;
    let exifJson: string | null = null;
    let metricsJson: string | null = null;
    let framesJson: string | null = null;
    let transcript: string | null = null;

    if (magicCheck.modality === 'image') {
      const imgMetrics = await analyzeImageBuffer(file.buffer);
      elaFilename = imgMetrics.elaFilename;
      fftFilename = imgMetrics.fftFilename;
      perceptualHash = imgMetrics.perceptualHash;
      exifJson = JSON.stringify(imgMetrics.exifSummary);
      metricsJson = JSON.stringify({
        width: imgMetrics.width,
        height: imgMetrics.height,
        elaMean: imgMetrics.elaMean,
        elaMax: imgMetrics.elaMax,
        elaP95: imgMetrics.elaP95,
        blockVarianceRatio: imgMetrics.blockVarianceRatio,
        hotspotSector: imgMetrics.hotspotSector,
        fftHighFreqRatio: imgMetrics.fftHighFreqRatio,
        fftPeriodicPeakScore: imgMetrics.fftPeriodicPeakScore,
        manipulationIndicators: imgMetrics.manipulationIndicators,
        aiGenerationIndicators: imgMetrics.aiGenerationIndicators,
        suspiciousRegions: imgMetrics.suspiciousRegions,
        integrityCheck: imgMetrics.integrityCheck,
      });
    } else if (magicCheck.modality === 'audio') {
      const audMetrics = analyzeAudioBuffer(file.buffer, magicCheck.canonicalMime);
      metricsJson = JSON.stringify(audMetrics);
    } else if (magicCheck.modality === 'document') {
      const docMetrics = analyzeDocumentBuffer(file.buffer, magicCheck.canonicalMime);
      metricsJson = JSON.stringify(docMetrics);
      transcript = docMetrics.extractedExcerpt;
    } else if (magicCheck.modality === 'video') {
      let extraMeta: z.infer<typeof videoMetaSchema> = {};
      if (typeof req.body?.videoMetaJson === 'string') {
        try {
          extraMeta = videoMetaSchema.parse(JSON.parse(req.body.videoMetaJson));
        } catch {
          extraMeta = {};
        }
      }

      let parsedFrames: Array<z.infer<typeof videoFrameSchema>> = [];
      if (typeof req.body?.framesJson === 'string' && req.body.framesJson.trim() !== '') {
        try {
          parsedFrames = z.array(videoFrameSchema).max(12).parse(JSON.parse(req.body.framesJson));
          framesJson = JSON.stringify(parsedFrames);
        } catch {
          parsedFrames = [];
        }
      }

      const vidMetrics = analyzeVideoBuffer(file.buffer, magicCheck.canonicalMime, {
        durationSec: extraMeta.durationSec ?? undefined,
        width: extraMeta.width ?? undefined,
        height: extraMeta.height ?? undefined,
        hasAudioTrack: extraMeta.hasAudioTrack ?? null,
        audioSyncNote: extraMeta.audioSyncNote ? sanitizeText(extraMeta.audioSyncNote, 300) : undefined,
        frames: parsedFrames,
      });
      metricsJson = JSON.stringify(vidMetrics);
    }

    await db.insert(evidenceItems).values({
      id: evidenceId,
      caseId,
      userId: req.user!.id,
      modality: magicCheck.modality,
      originalFilename,
      storedFilename: randomStoredName,
      elaFilename,
      fftFilename,
      mimeType: magicCheck.canonicalMime,
      byteSize: file.buffer.length,
      sha256,
      perceptualHash,
      exifJson,
      metricsJson,
      framesJson,
      transcript,
      createdAt: now,
    });

    await appendCustodyEntry({
      caseId,
      userId: req.user!.id,
      evidenceId,
      action: 'INGEST_ORIGINAL',
      fileSha256: sha256,
      createdAt: now,
    });

    await recordAuditEvent({
      req,
      userId: req.user!.id,
      action: 'EVIDENCE_UPLOAD',
      resourceType: 'evidence',
      resourceId: evidenceId,
      details: `Ingested ${magicCheck.modality} "${originalFilename}" (${file.buffer.length} bytes, sha256:${sha256.slice(0, 12)})`,
    });

    // Refresh deterministic correlations and manipulation indicators with newly ingested item
    const updatedEvRows = await db
      .select()
      .from(evidenceItems)
      .where(and(eq(evidenceItems.caseId, caseId), eq(evidenceItems.userId, req.user!.id)))
      .orderBy(asc(evidenceItems.createdAt));

    const detUpdate = runDeterministicCrossModalEngine({
      caseTitle: owned[0].title,
      captionText: owned[0].captionText,
      evidenceRows: updatedEvRows,
    });

    await db
      .update(cases)
      .set({
        correlationsJson: JSON.stringify(detUpdate.correlations),
        manipulationJson: JSON.stringify(detUpdate.manipulationIndicators),
        analysisStale: 1,
        updatedAt: now,
      })
      .where(and(eq(cases.id, caseId), eq(cases.userId, req.user!.id)));

    const full = await loadFullCaseForUser(caseId, req.user!.id);
    res.status(201).json({
      ...full,
      uploadedEvidenceId: evidenceId,
      uploadedSha256: sha256,
    });
  },
);

// Authorized streaming routes for original uploads, ELA PNG, and FFT PNG (never publicly exposed)
app.get('/api/cases/:caseId/evidence/:evidenceId/file', requireAuth, async (req: AuthedRequest, res) => {
  const caseId = String(req.params.caseId);
  const evidenceId = String(req.params.evidenceId);
  const rows = await db
    .select()
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.id, evidenceId),
        eq(evidenceItems.caseId, caseId),
        eq(evidenceItems.userId, req.user!.id),
      ),
    )
    .limit(1);

  if (rows.length === 0 || !rows[0].storedFilename) {
    res.status(404).json({ error: 'Evidence file not found.' });
    return;
  }

  const safePath = path.join(UPLOADS_DIR, path.basename(rows[0].storedFilename));
  if (!fs.existsSync(safePath)) {
    res.status(404).json({ error: 'Stored file missing.' });
    return;
  }

  res.setHeader('Content-Type', rows[0].mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${sanitizeFilename(rows[0].originalFilename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(safePath).pipe(res);
});

app.get('/api/cases/:caseId/evidence/:evidenceId/ela', requireAuth, async (req: AuthedRequest, res) => {
  const caseId = String(req.params.caseId);
  const evidenceId = String(req.params.evidenceId);
  const rows = await db
    .select()
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.id, evidenceId),
        eq(evidenceItems.caseId, caseId),
        eq(evidenceItems.userId, req.user!.id),
      ),
    )
    .limit(1);

  if (rows.length === 0 || !rows[0].elaFilename) {
    res.status(404).json({ error: 'ELA heatmap not found.' });
    return;
  }

  const safePath = path.join(ELA_DIR, path.basename(rows[0].elaFilename));
  if (!fs.existsSync(safePath)) {
    res.status(404).json({ error: 'ELA asset missing.' });
    return;
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(safePath).pipe(res);
});

app.get('/api/cases/:caseId/evidence/:evidenceId/fft', requireAuth, async (req: AuthedRequest, res) => {
  const caseId = String(req.params.caseId);
  const evidenceId = String(req.params.evidenceId);
  const rows = await db
    .select()
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.id, evidenceId),
        eq(evidenceItems.caseId, caseId),
        eq(evidenceItems.userId, req.user!.id),
      ),
    )
    .limit(1);

  if (rows.length === 0 || !rows[0].fftFilename) {
    res.status(404).json({ error: 'FFT spectrum not found.' });
    return;
  }

  const safePath = path.join(ELA_DIR, path.basename(rows[0].fftFilename));
  if (!fs.existsSync(safePath)) {
    res.status(404).json({ error: 'FFT asset missing.' });
    return;
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(safePath).pipe(res);
});

// Run Gemini 2.5 Flash cross-modal forensic synthesis
app.post(
  '/api/cases/:caseId/analyze',
  requireAuth,
  requireCsrf,
  aiLimiter,
  async (req: AuthedRequest, res) => {
    const caseId = String(req.params.caseId);
    const full = await loadFullCaseForUser(caseId, req.user!.id);
    if (!full) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }

    const evRows = await db
      .select()
      .from(evidenceItems)
      .where(and(eq(evidenceItems.caseId, caseId), eq(evidenceItems.userId, req.user!.id)));

    if (evRows.length === 0 && !full.case.captionText) {
      res.status(400).json({ error: 'Upload at least one evidence item or caption before running analysis.' });
      return;
    }

    const images = [];
    const audios = [];
    const videos = [];
    const documents = [];

    for (const ev of evRows) {
      if (ev.modality === 'image' && ev.storedFilename) {
        const diskPath = path.join(UPLOADS_DIR, path.basename(ev.storedFilename));
        if (fs.existsSync(diskPath)) {
          const buf = fs.readFileSync(diskPath);
          const m = ev.metricsJson ? JSON.parse(ev.metricsJson) : {};
          images.push({
            evidenceId: ev.id,
            filename: ev.originalFilename,
            mimeType: ev.mimeType,
            buffer: buf,
            elaSummary: `ELA mean=${m.elaMean ?? 'n/a'}, max=${m.elaMax ?? 'n/a'}, sector=${m.hotspotSector ?? 'n/a'}, varianceRatio=${m.blockVarianceRatio ?? 'n/a'}`,
            exifSummary: ev.exifJson ?? '{}',
            fftSummary: `highFreqRatio=${m.fftHighFreqRatio ?? 'n/a'}, periodicPeakScore=${m.fftPeriodicPeakScore ?? 'n/a'}`,
            perceptualHash: ev.perceptualHash ?? '',
          });
        }
      } else if (ev.modality === 'audio' && ev.storedFilename) {
        const diskPath = path.join(UPLOADS_DIR, path.basename(ev.storedFilename));
        if (fs.existsSync(diskPath)) {
          const buf = fs.readFileSync(diskPath);
          audios.push({
            evidenceId: ev.id,
            filename: ev.originalFilename,
            mimeType: ev.mimeType,
            buffer: buf,
            signalSummary: ev.metricsJson ?? '{}',
          });
        }
      } else if (ev.modality === 'document') {
        const docMetrics = ev.metricsJson ? JSON.parse(ev.metricsJson) : {};
        documents.push({
          evidenceId: ev.id,
          filename: ev.originalFilename,
          mimeType: ev.mimeType,
          summary: `type=${docMetrics.documentType ?? 'unknown'}, pdfVersion=${docMetrics.pdfVersion ?? 'n/a'}, pages=${docMetrics.estimatedPages ?? 'n/a'}, author=${docMetrics.author ?? 'n/a'}, creator=${docMetrics.creator ?? 'n/a'}, producer=${docMetrics.producer ?? 'n/a'}, incrementalUpdates=${docMetrics.incrementalUpdatesCount ?? 0}, embeddedScripts=${Boolean(docMetrics.hasEmbeddedScripts)}`,
          excerpt: ev.transcript ?? docMetrics.extractedExcerpt ?? '',
        });
      } else if (ev.modality === 'video') {
        let frames: Array<{
          timestampSec: number;
          deltaScore: number;
          suspicious: boolean;
          thumbnailDataUrl: string;
        }> = [];
        try {
          const parsedFrames = ev.framesJson ? JSON.parse(ev.framesJson) : [];
          frames = Array.isArray(parsedFrames) ? parsedFrames : [];
        } catch {
          frames = [];
        }
        const prioritized = [
          ...frames.filter((f) => f.suspicious),
          ...frames.filter((f) => !f.suspicious),
        ].slice(0, 4);
        videos.push({
          evidenceId: ev.id,
          filename: ev.originalFilename,
          frameCount: frames.length,
          suspiciousSummary: ev.metricsJson ?? '{}',
          sampleFramesBase64: prioritized.map((f) => ({
            timestampSec: f.timestampSec,
            base64Jpeg: f.thumbnailDataUrl,
          })),
        });
      }
    }

    const deterministic = runDeterministicCrossModalEngine({
      caseTitle: full.case.title,
      captionText: full.case.captionText,
      evidenceRows: evRows,
    });

    let report = {
      riskLevel: deterministic.riskLevel,
      confidenceMin: deterministic.confidenceMin,
      confidenceMax: deterministic.confidenceMax,
      summary: deterministic.summary,
      audioTranscripts: [] as Array<{ evidenceId: string; transcript: string }>,
      findings: deterministic.findings,
      graphNodes: deterministic.graphNodes,
      graphEdges: deterministic.graphEdges,
      limitations: deterministic.limitations,
      alternativeExplanations: deterministic.alternativeExplanations,
      recommendedChecks: deterministic.recommendedChecks,
    };
    let analysisMode: 'hybrid_ai' | 'deterministic_heuristics' = 'deterministic_heuristics';

    if (env.geminiApiKey) {
      try {
        const geminiReport = await analyzeCaseWithGemini({
          caseTitle: full.case.title,
          captionText: full.case.captionText,
          images,
          audios,
          videos,
          documents,
        });
        analysisMode = 'hybrid_ai';
        report = {
          ...geminiReport,
          findings:
            geminiReport.findings.length > 0 ? geminiReport.findings : deterministic.findings,
          graphNodes:
            geminiReport.graphNodes.length > 0
              ? geminiReport.graphNodes
              : deterministic.graphNodes,
          graphEdges:
            geminiReport.graphEdges.length > 0
              ? geminiReport.graphEdges
              : deterministic.graphEdges,
          limitations:
            geminiReport.limitations.length > 0
              ? geminiReport.limitations
              : deterministic.limitations,
          alternativeExplanations:
            geminiReport.alternativeExplanations.length > 0
              ? geminiReport.alternativeExplanations
              : deterministic.alternativeExplanations,
          recommendedChecks:
            geminiReport.recommendedChecks.length > 0
              ? geminiReport.recommendedChecks
              : deterministic.recommendedChecks,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gemini upstream error';
        console.warn('[analyze fallback to deterministic]', msg);
        report.limitations = [
          ...deterministic.limitations,
          `Gemini multimodal synthesis skipped/unavailable (${msg.slice(0, 120)}); assessment reflects deterministic signal heuristics and metadata correlation only.`,
        ];
      }
    } else {
      report.limitations = [
        ...deterministic.limitations,
        'GEMINI_API_KEY is not configured in server secrets; analysis used deterministic signal heuristics and cross-modal metadata correlation.',
      ];
    }

    const now = Date.now();
    await db
      .update(cases)
      .set({
        riskLevel: report.riskLevel,
        confidenceMin: report.confidenceMin,
        confidenceMax: report.confidenceMax,
        summary: report.summary,
        analysisMode,
        analysisStale: 0,
        correlationsJson: JSON.stringify(deterministic.correlations),
        manipulationJson: JSON.stringify(deterministic.manipulationIndicators),
        limitationsJson: JSON.stringify(report.limitations),
        alternativesJson: JSON.stringify(report.alternativeExplanations),
        recommendedChecksJson: JSON.stringify(report.recommendedChecks),
        updatedAt: now,
      })
      .where(and(eq(cases.id, caseId), eq(cases.userId, req.user!.id)));

    for (const tr of report.audioTranscripts) {
      await db
        .update(evidenceItems)
        .set({ transcript: tr.transcript })
        .where(
          and(
            eq(evidenceItems.id, tr.evidenceId),
            eq(evidenceItems.caseId, caseId),
            eq(evidenceItems.userId, req.user!.id),
          ),
        );
    }

    // Replace findings & graph for this case cleanly
    await db.delete(findings).where(eq(findings.caseId, caseId));
    await db.delete(graphNodes).where(eq(graphNodes.caseId, caseId));
    await db.delete(graphEdges).where(eq(graphEdges.caseId, caseId));

    if (report.findings.length > 0) {
      await db.insert(findings).values(
        report.findings.map((f, idx) => ({
          id: crypto.randomUUID(),
          caseId,
          evidenceId: f.evidenceId || null,
          modality: f.modality,
          indicator: f.indicator,
          whyFlagged: f.whyFlagged,
          locationOrTimestamp: f.locationOrTimestamp,
          confidenceRange: f.confidenceRange,
          limitation: f.limitation,
          severity: f.severity,
          createdAt: now + idx,
        })),
      );
    }

    if (report.graphNodes.length > 0) {
      await db.insert(graphNodes).values(
        report.graphNodes.map((n) => ({
          id: crypto.randomUUID(),
          caseId,
          nodeKey: n.nodeKey,
          label: n.label,
          nodeType: n.nodeType,
          modality: n.modality,
          details: n.details,
        })),
      );
    }

    if (report.graphEdges.length > 0) {
      await db.insert(graphEdges).values(
        report.graphEdges.map((e) => ({
          id: crypto.randomUUID(),
          caseId,
          sourceKey: e.sourceKey,
          targetKey: e.targetKey,
          relation: e.relation,
          label: e.label,
          explanation: e.explanation,
          confidenceRange: e.confidenceRange,
          limitation: e.limitation,
        })),
      );
    }

    const bundleDigest = computeSha256(
      Buffer.from(evRows.map((r) => r.sha256).join(':') + ':' + report.summary, 'utf8'),
    );
    await appendCustodyEntry({
      caseId,
      userId: req.user!.id,
      evidenceId: null,
      action: 'FORENSIC_ANALYSIS_COMMIT',
      fileSha256: bundleDigest,
      createdAt: now,
    });

    await recordAuditEvent({
      req,
      userId: req.user!.id,
      action: 'FORENSIC_ANALYZE',
      resourceType: 'case',
      resourceId: caseId,
      details: `${analysisMode} synthesis completed (risk=${report.riskLevel}, range=${report.confidenceMin}-${report.confidenceMax}%)`,
    });

    const updated = await loadFullCaseForUser(caseId, req.user!.id);
    res.json(updated);
  },
);

// Verify Tamper-Evident Chain of Custody
app.post(
  '/api/cases/:caseId/verify-ledger',
  requireAuth,
  requireCsrf,
  async (req: AuthedRequest, res) => {
    const caseId = String(req.params.caseId);
    const owned = await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.userId, req.user!.id)))
      .limit(1);

    if (owned.length === 0) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }

    const result = await verifyCaseLedger(caseId, req.user!.id);
    await recordAuditEvent({
      req,
      userId: req.user!.id,
      action: 'LEDGER_VERIFY',
      resourceType: 'case',
      resourceId: caseId,
      details: `Verified custody ledger (valid=${result.valid}, entries=${result.entriesChecked})`,
    });
    res.json(result);
  },
);

// Commit Human Investigator Verification & Check-Offs to Custody Ledger
app.post(
  '/api/cases/:caseId/human-review',
  requireAuth,
  requireCsrf,
  async (req: AuthedRequest, res) => {
    const caseId = String(req.params.caseId);
    const owned = await db
      .select()
      .from(cases)
      .where(and(eq(cases.id, caseId), eq(cases.userId, req.user!.id)))
      .limit(1);

    if (owned.length === 0) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }

    const parsed = humanReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid human verification payload.' });
      return;
    }

    const now = Date.now();
    const reviewPayload = {
      status: parsed.data.status,
      reviewerNote: sanitizeText(parsed.data.reviewerNote, 1500),
      checkedItems: parsed.data.checkedItems.map((c) => sanitizeText(c, 400)).filter(Boolean),
      findingDecisions: parsed.data.findingDecisions,
      signedOffBy: req.user!.displayName,
      signedOffAt: now,
    };

    const reviewJson = JSON.stringify(reviewPayload);
    await db
      .update(cases)
      .set({ humanReviewJson: reviewJson, updatedAt: now })
      .where(and(eq(cases.id, caseId), eq(cases.userId, req.user!.id)));

    const reviewDigest = computeSha256(Buffer.from(reviewJson, 'utf8'));
    await appendCustodyEntry({
      caseId,
      userId: req.user!.id,
      evidenceId: null,
      action: 'HUMAN_REVIEW_COMMIT',
      fileSha256: reviewDigest,
      createdAt: now,
    });

    await recordAuditEvent({
      req,
      userId: req.user!.id,
      action: 'HUMAN_REVIEW',
      resourceType: 'case',
      resourceId: caseId,
      details: `Investigator verification saved (status=${reviewPayload.status}, checked=${reviewPayload.checkedItems.length})`,
    });

    const full = await loadFullCaseForUser(caseId, req.user!.id);
    res.json(full);
  },
);

// Multilingual Voice Forensic Agent
app.post(
  '/api/cases/:caseId/agent',
  requireAuth,
  requireCsrf,
  aiLimiter,
  async (req: AuthedRequest, res) => {
    const caseId = String(req.params.caseId);
    const parsed = agentChatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid agent prompt or language.' });
      return;
    }

    const full = await loadFullCaseForUser(caseId, req.user!.id);
    if (!full) {
      res.status(404).json({ error: 'Case not found.' });
      return;
    }

    const reportContext: StoredReportContext = {
      caseTitle: full.case.title,
      riskLevel: full.case.riskLevel,
      confidenceMin: full.case.confidenceMin,
      confidenceMax: full.case.confidenceMax,
      summary: full.case.summary,
      captionText: full.case.captionText,
      findings: full.findings.map((f) => ({
        id: f.id,
        modality: f.modality,
        indicator: f.indicator,
        whyFlagged: f.whyFlagged,
        locationOrTimestamp: f.locationOrTimestamp,
        confidenceRange: f.confidenceRange,
        limitation: f.limitation,
      })),
      edges: full.graph.edges.map((e) => ({
        sourceKey: e.sourceKey,
        targetKey: e.targetKey,
        relation: e.relation,
        label: e.label,
        explanation: e.explanation,
      })),
      limitations: full.case.limitations,
      alternativeExplanations: full.case.alternativeExplanations,
      recommendedChecks: full.case.recommendedChecks,
    };

    const cleanQuestion = sanitizeText(parsed.data.question, 1000);
    const history = full.agentMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let agentRes: { reply: string; citedFindingIds: string[] };
    let responseMode: 'ai' | 'deterministic_fallback' = 'ai';
    let notice: string | null = null;

    if (env.geminiApiKey) {
      try {
        agentRes = await runForensicAgentChat({
          report: reportContext,
          userQuestion: cleanQuestion,
          language: parsed.data.language,
          devilsAdvocate: parsed.data.devilsAdvocate,
          history,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Agent request failed.';
        console.warn('[agent fallback to local dossier]', msg);
        responseMode = 'deterministic_fallback';
        notice = `Gemini API unavailable (${msg.slice(0, 100)}); answered from stored local forensic dossier.`;
        agentRes = buildDeterministicAgentBriefing({
          report: reportContext,
          userQuestion: cleanQuestion,
          language: parsed.data.language,
          devilsAdvocate: parsed.data.devilsAdvocate,
        });
      }
    } else {
      responseMode = 'deterministic_fallback';
      notice = 'GEMINI_API_KEY is not configured; answered from stored local forensic dossier.';
      agentRes = buildDeterministicAgentBriefing({
        report: reportContext,
        userQuestion: cleanQuestion,
        language: parsed.data.language,
        devilsAdvocate: parsed.data.devilsAdvocate,
      });
    }

    const now = Date.now();
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    await db.insert(agentMessages).values([
      {
        id: userMsgId,
        caseId,
        userId: req.user!.id,
        role: 'user',
        language: parsed.data.language,
        devilsAdvocate: parsed.data.devilsAdvocate ? 1 : 0,
        content: cleanQuestion,
        citedFindingIdsJson: '[]',
        createdAt: now,
      },
      {
        id: assistantMsgId,
        caseId,
        userId: req.user!.id,
        role: 'assistant',
        language: parsed.data.language,
        devilsAdvocate: parsed.data.devilsAdvocate ? 1 : 0,
        content: agentRes.reply,
        citedFindingIdsJson: JSON.stringify(agentRes.citedFindingIds),
        createdAt: now + 1,
      },
    ]);

    await recordAuditEvent({
      req,
      userId: req.user!.id,
      action: 'VOICE_AGENT_QUERY',
      resourceType: 'case',
      resourceId: caseId,
      details: `Voice agent query (${responseMode}) in ${parsed.data.language} (devilsAdvocate=${parsed.data.devilsAdvocate})`,
    });

    res.json({
      reply: agentRes.reply,
      citedFindingIds: agentRes.citedFindingIds,
      language: parsed.data.language,
      devilsAdvocate: parsed.data.devilsAdvocate,
      mode: responseMode,
      notice,
    });
  },
);

// --- Real-Time Community Calibration Voting Loop ---
app.get('/api/community/votes', async (req, res) => {
  const topicKey = sanitizeText(String(req.query.topicKey || PUBLIC_BENCHMARK_TOPIC), 80);
  const summary = await getCommunitySummary(topicKey);
  res.json(summary);
});

app.post('/api/community/votes', requireAuth, requireCsrf, async (req: AuthedRequest, res) => {
  const parsed = communityVoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid community calibration vote payload.' });
    return;
  }

  const topicKey = sanitizeText(parsed.data.topicKey, 80);
  const rationale = sanitizeText(parsed.data.rationale, 400);

  await db.insert(communityVotes).values({
    id: crypto.randomUUID(),
    topicKey,
    userId: req.user!.id,
    voterName: req.user!.displayName,
    stance: parsed.data.stance,
    rationale,
    createdAt: Date.now(),
  });

  await recordAuditEvent({
    req,
    userId: req.user!.id,
    action: 'COMMUNITY_VOTE',
    resourceType: 'community_vote',
    resourceId: topicKey,
    details: `Submitted calibration stance: ${parsed.data.stance}`,
  });

  const summary = await getCommunitySummary(topicKey);
  broadcastCommunityUpdate(topicKey, summary);
  res.status(201).json(summary);
});

async function startServer() {
  if (!env.isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { dotfiles: 'deny' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Generic error handler (never leaks stack traces to client)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[unhandled error]', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'An internal server error occurred.' });
  });

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`TruthLens server listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup failure:', err);
  process.exit(1);
});
