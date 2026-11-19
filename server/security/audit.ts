import crypto from 'node:crypto';
import type { Request } from 'express';
import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { env } from '../env.ts';
import { sanitizeText } from './sanitize.ts';

function hashIp(ip: string): string {
  return crypto
    .createHmac('sha256', env.sessionSecret)
    .update(ip || 'unknown')
    .digest('hex')
    .slice(0, 16);
}

export async function recordAuditEvent(params: {
  req?: Request;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details: string;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      userId: params.userId ?? null,
      action: sanitizeText(params.action, 64),
      resourceType: sanitizeText(params.resourceType, 64),
      resourceId: params.resourceId ? sanitizeText(params.resourceId, 80) : null,
      ipHash: hashIp(params.req?.ip ?? 'local'),
      details: sanitizeText(params.details, 400),
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error('[audit] failed to record event:', err instanceof Error ? err.message : err);
  }
}
