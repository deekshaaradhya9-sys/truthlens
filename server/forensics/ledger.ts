import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { asc, eq, and } from 'drizzle-orm';
import { db, UPLOADS_DIR } from '../db/index.ts';
import { custodyLedger, evidenceItems } from '../db/schema.ts';

const GENESIS_HASH = '0'.repeat(64);

export function computeSha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function computeLedgerEntryHash(params: {
  prevEntryHash: string;
  caseId: string;
  evidenceId: string | null;
  action: string;
  fileSha256: string;
  createdAt: number;
}): string {
  const payload = [
    params.prevEntryHash,
    params.caseId,
    params.evidenceId ?? 'NONE',
    params.action,
    params.fileSha256,
    String(params.createdAt),
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function appendCustodyEntry(params: {
  caseId: string;
  userId: string;
  evidenceId: string | null;
  action: string;
  fileSha256: string;
  createdAt?: number;
}) {
  const existing = await db
    .select()
    .from(custodyLedger)
    .where(and(eq(custodyLedger.caseId, params.caseId), eq(custodyLedger.userId, params.userId)))
    .orderBy(asc(custodyLedger.entryIndex));

  const last = existing[existing.length - 1];
  const entryIndex = last ? last.entryIndex + 1 : 0;
  const prevEntryHash = last ? last.entryHash : GENESIS_HASH;
  const createdAt = params.createdAt ?? Date.now();

  const entryHash = computeLedgerEntryHash({
    prevEntryHash,
    caseId: params.caseId,
    evidenceId: params.evidenceId,
    action: params.action,
    fileSha256: params.fileSha256,
    createdAt,
  });

  const entry = {
    id: crypto.randomUUID(),
    caseId: params.caseId,
    userId: params.userId,
    entryIndex,
    evidenceId: params.evidenceId,
    action: params.action,
    fileSha256: params.fileSha256,
    prevEntryHash,
    entryHash,
    createdAt,
  };

  await db.insert(custodyLedger).values(entry);
  return entry;
}

export interface LedgerVerificationResult {
  valid: boolean;
  entriesChecked: number;
  filesVerified: number;
  mismatches: string[];
  verifiedAt: number;
  headHash: string;
}

export async function verifyCaseLedger(
  caseId: string,
  userId: string,
): Promise<LedgerVerificationResult> {
  const entries = await db
    .select()
    .from(custodyLedger)
    .where(and(eq(custodyLedger.caseId, caseId), eq(custodyLedger.userId, userId)))
    .orderBy(asc(custodyLedger.entryIndex));

  const items = await db
    .select()
    .from(evidenceItems)
    .where(and(eq(evidenceItems.caseId, caseId), eq(evidenceItems.userId, userId)));

  const itemById = new Map(items.map((item) => [item.id, item]));
  const mismatches: string[] = [];
  let expectedPrev = GENESIS_HASH;
  let filesVerified = 0;

  for (const entry of entries) {
    if (entry.prevEntryHash !== expectedPrev) {
      mismatches.push(`Entry #${entry.entryIndex}: previous hash link broken.`);
    }
    const recomputed = computeLedgerEntryHash({
      prevEntryHash: entry.prevEntryHash,
      caseId: entry.caseId,
      evidenceId: entry.evidenceId,
      action: entry.action,
      fileSha256: entry.fileSha256,
      createdAt: entry.createdAt,
    });
    if (recomputed !== entry.entryHash) {
      mismatches.push(`Entry #${entry.entryIndex}: ledger payload hash mismatch.`);
    }
    if (entry.evidenceId && entry.action === 'INGEST_ORIGINAL') {
      const ev = itemById.get(entry.evidenceId);
      if (ev?.storedFilename) {
        const diskPath = path.join(UPLOADS_DIR, path.basename(ev.storedFilename));
        if (!fs.existsSync(diskPath)) {
          mismatches.push(`Entry #${entry.entryIndex}: immutable original file missing on disk.`);
        } else {
          const diskSha = computeSha256(fs.readFileSync(diskPath));
          if (diskSha !== entry.fileSha256) {
            mismatches.push(
              `Entry #${entry.entryIndex}: original file SHA-256 altered (${diskSha.slice(0, 12)} != ${entry.fileSha256.slice(0, 12)}).`,
            );
          } else {
            filesVerified += 1;
          }
        }
      }
    }
    expectedPrev = entry.entryHash;
  }

  return {
    valid: mismatches.length === 0 && entries.length > 0,
    entriesChecked: entries.length,
    filesVerified,
    mismatches,
    verifiedAt: Date.now(),
    headHash: entries.length > 0 ? entries[entries.length - 1].entryHash : GENESIS_HASH,
  };
}
