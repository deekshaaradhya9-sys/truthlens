import crypto from 'node:crypto';
import argon2 from 'argon2';
import { eq, and, gt } from 'drizzle-orm';
import type { CookieOptions, Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { users, sessions } from '../db/schema.ts';
import { env } from '../env.ts';

export const SESSION_COOKIE_NAME = 'tl_session';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isDemoUser: boolean;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  csrfToken?: string;
  sessionId?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function hashSessionToken(rawToken: string): string {
  return crypto
    .createHmac('sha256', env.sessionSecret)
    .update(rawToken)
    .digest('hex');
}

export function isRequestHttps(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim() === 'https') return true;
  return env.isProd;
}

export async function createUserSession(
  res: Response,
  req: Request,
  userId: string,
): Promise<{ csrfToken: string; expiresAt: number; sessionToken: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    csrfToken,
    expiresAt,
    createdAt: now,
  });

  const isHttps = isRequestHttps(req);
  const cookieOpts: CookieOptions & { partitioned?: boolean } = {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    partitioned: isHttps,
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
  res.cookie(SESSION_COOKIE_NAME, rawToken, cookieOpts);

  return { csrfToken, expiresAt, sessionToken: rawToken };
}

function extractRawSessionToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length >= 32) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length >= 32) return bearer;
  }
  return null;
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const rawToken = extractRawSessionToken(req);
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  const isHttps = isRequestHttps(req);
  const clearOpts: CookieOptions & { partitioned?: boolean } = {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    partitioned: isHttps,
    path: '/',
  };
  res.clearCookie(SESSION_COOKIE_NAME, clearOpts);
}

export async function resolveSessionUser(req: Request): Promise<{
  user: AuthUser;
  csrfToken: string;
  sessionId: string;
} | null> {
  const rawToken = extractRawSessionToken(req);
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();

  const rows = await db
    .select({
      sessionId: sessions.id,
      csrfToken: sessions.csrfToken,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      isDemoUser: users.isDemoUser,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    user: {
      id: row.userId,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      isDemoUser: row.isDemoUser === 1,
    },
    csrfToken: row.csrfToken,
    sessionId: row.sessionId,
  };
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const resolved = await resolveSessionUser(req);
  if (!resolved) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  req.user = resolved.user;
  req.csrfToken = resolved.csrfToken;
  req.sessionId = resolved.sessionId;
  next();
}

export function verifySameOrigin(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // Same-origin non-fetch or direct server check

  const forwardedHost =
    typeof req.headers['x-forwarded-host'] === 'string'
      ? req.headers['x-forwarded-host'].split(',')[0].trim()
      : '';
  const host = req.headers.host ?? '';
  if (!forwardedHost && !host) return false;

  try {
    const parsedOrigin = new URL(origin);
    return (
      (Boolean(forwardedHost) && parsedOrigin.host === forwardedHost) ||
      (Boolean(host) && parsedOrigin.host === host)
    );
  } catch {
    return false;
  }
}

export function requireCsrf(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  if (!verifySameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin mutation blocked.' });
    return;
  }

  const headerToken = req.headers['x-csrf-token'];
  if (
    !req.csrfToken ||
    typeof headerToken !== 'string' ||
    headerToken.length !== req.csrfToken.length
  ) {
    res.status(403).json({ error: 'Invalid or missing CSRF token.' });
    return;
  }

  const valid = crypto.timingSafeEqual(
    Buffer.from(headerToken, 'utf8'),
    Buffer.from(req.csrfToken, 'utf8'),
  );
  if (!valid) {
    res.status(403).json({ error: 'Invalid CSRF token.' });
    return;
  }

  next();
}

export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges required.' });
    return;
  }
  next();
}
