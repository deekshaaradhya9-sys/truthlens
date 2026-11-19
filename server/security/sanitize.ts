import path from 'node:path';
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeText(input: string, maxLen = 4000): string {
  const cleaned = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })
    .replace(/\u0000/g, '')
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function sanitizeFilename(raw: string): string {
  const base = path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.slice(0, 120) || 'evidence_file';
}

export const ALLOWED_UPLOAD_TYPES = {
  'image/jpeg': { ext: '.jpg', modality: 'image' },
  'image/jpg': { ext: '.jpg', modality: 'image' },
  'image/png': { ext: '.png', modality: 'image' },
  'image/webp': { ext: '.webp', modality: 'image' },
  'audio/wav': { ext: '.wav', modality: 'audio' },
  'audio/x-wav': { ext: '.wav', modality: 'audio' },
  'audio/wave': { ext: '.wav', modality: 'audio' },
  'audio/vnd.wave': { ext: '.wav', modality: 'audio' },
  'audio/mpeg': { ext: '.mp3', modality: 'audio' },
  'audio/mp3': { ext: '.mp3', modality: 'audio' },
  'audio/mp4': { ext: '.m4a', modality: 'audio' },
  'audio/m4a': { ext: '.m4a', modality: 'audio' },
  'audio/x-m4a': { ext: '.m4a', modality: 'audio' },
  'audio/ogg': { ext: '.ogg', modality: 'audio' },
  'audio/webm': { ext: '.webm', modality: 'audio' },
  'video/mp4': { ext: '.mp4', modality: 'video' },
  'video/webm': { ext: '.webm', modality: 'video' },
  'application/pdf': { ext: '.pdf', modality: 'document' },
  'application/x-pdf': { ext: '.pdf', modality: 'document' },
  'text/plain': { ext: '.txt', modality: 'document' },
} as const;

export const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.wav',
  '.mp3',
  '.m4a',
  '.ogg',
  '.mp4',
  '.webm',
  '.pdf',
  '.txt',
]);

export type AllowedMime = keyof typeof ALLOWED_UPLOAD_TYPES;

export function normalizeMimeType(rawMime: string): string {
  return (rawMime || '').split(';')[0].trim().toLowerCase();
}

function isSafeUtf8PlainText(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0x00 || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) || b === 0x7f) {
      return false;
    }
  }
  return true;
}

function looksLikeBinaryExecutableOrHtml(buf: Buffer): boolean {
  if (buf.length < 2) return false;
  const head4 = buf.subarray(0, 4).toString('ascii');
  if (buf[0] === 0x4d && buf[1] === 0x5a) return true; // PE/EXE MZ
  if (buf[0] === 0x7f && buf.subarray(1, 4).toString('ascii') === 'ELF') return true; // ELF
  if (head4 === 'PK\x03\x04') return true; // ZIP/OOXML
  const textHead = buf.subarray(0, Math.min(64, buf.length)).toString('utf8').trimStart().toLowerCase();
  if (textHead.startsWith('<script') || textHead.startsWith('<!doctype html') || textHead.startsWith('<html')) {
    return true;
  }
  return false;
}

function hasMp3SyncFrame(buf: Buffer): boolean {
  if (buf.subarray(0, 3).toString('ascii') === 'ID3') return true;
  const limit = Math.min(buf.length - 1, 512);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0 && (buf[i + 1] & 0x06) !== 0x00) {
      return true;
    }
  }
  return false;
}

export function verifyMagicBytes(
  buf: Buffer,
  rawDeclaredMime: string,
  originalFilename = '',
):
  | {
      ok: true;
      canonicalMime: string;
      modality: 'image' | 'audio' | 'video' | 'document';
      ext: string;
    }
  | { ok: false; reason: string } {
  if (!buf || buf.length === 0) {
    return { ok: false, reason: 'Uploaded file is empty (0 bytes).' };
  }

  if (looksLikeBinaryExecutableOrHtml(buf)) {
    return { ok: false, reason: 'Dangerous executable or HTML/script signature rejected.' };
  }

  const declaredMime = normalizeMimeType(rawDeclaredMime);
  const ext = path.extname(originalFilename || '').toLowerCase();
  const isGenericMime =
    declaredMime === '' || declaredMime === 'application/octet-stream';

  // Reject clearly disallowed non-generic MIME types early
  if (!isGenericMime && !(declaredMime in ALLOWED_UPLOAD_TYPES)) {
    return { ok: false, reason: `Unsupported MIME type "${declaredMime}".` };
  }

  // 1. JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    if (declaredMime === 'image/jpeg' || declaredMime === 'image/jpg' || (isGenericMime && (ext === '.jpg' || ext === '.jpeg'))) {
      return { ok: true, canonicalMime: 'image/jpeg', modality: 'image', ext: '.jpg' };
    }
    return { ok: false, reason: 'JPEG magic bytes do not match declared MIME type or extension.' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    if (declaredMime === 'image/png' || (isGenericMime && ext === '.png')) {
      return { ok: true, canonicalMime: 'image/png', modality: 'image', ext: '.png' };
    }
    return { ok: false, reason: 'PNG magic bytes do not match declared MIME type or extension.' };
  }

  // 3. PDF: %PDF-
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    if (declaredMime === 'application/pdf' || declaredMime === 'application/x-pdf' || (isGenericMime && ext === '.pdf')) {
      return { ok: true, canonicalMime: 'application/pdf', modality: 'document', ext: '.pdf' };
    }
    return { ok: false, reason: 'PDF signature does not match declared MIME type or extension.' };
  }

  // 4. Plain text (.txt)
  if (declaredMime === 'text/plain' || (isGenericMime && ext === '.txt')) {
    if (!isSafeUtf8PlainText(buf)) {
      return { ok: false, reason: 'Text file contains invalid binary control bytes.' };
    }
    return { ok: true, canonicalMime: 'text/plain', modality: 'document', ext: '.txt' };
  }

  if (buf.length < 12) {
    return { ok: false, reason: 'File too small to verify binary signature.' };
  }

  // 5. RIFF container: WEBP or WAVE
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF') {
    const fourcc = buf.subarray(8, 12).toString('ascii');
    if (fourcc === 'WEBP' && (declaredMime === 'image/webp' || (isGenericMime && ext === '.webp'))) {
      return { ok: true, canonicalMime: 'image/webp', modality: 'image', ext: '.webp' };
    }
    if (
      fourcc === 'WAVE' &&
      (declaredMime === 'audio/wav' ||
        declaredMime === 'audio/x-wav' ||
        declaredMime === 'audio/wave' ||
        declaredMime === 'audio/vnd.wave' ||
        (isGenericMime && ext === '.wav'))
    ) {
      return { ok: true, canonicalMime: 'audio/wav', modality: 'audio', ext: '.wav' };
    }
    return { ok: false, reason: 'RIFF container signature does not match declared MIME type.' };
  }

  // 6. OGG: OggS
  if (buf.subarray(0, 4).toString('ascii') === 'OggS') {
    if (declaredMime === 'audio/ogg' || (isGenericMime && ext === '.ogg')) {
      return { ok: true, canonicalMime: 'audio/ogg', modality: 'audio', ext: '.ogg' };
    }
    return { ok: false, reason: 'OGG signature mismatch.' };
  }

  // 7. MP3: ID3 or MPEG sync frame
  if (hasMp3SyncFrame(buf)) {
    if (declaredMime === 'audio/mpeg' || declaredMime === 'audio/mp3' || (isGenericMime && ext === '.mp3')) {
      return { ok: true, canonicalMime: 'audio/mpeg', modality: 'audio', ext: '.mp3' };
    }
  }

  // 8. ISO BMFF (MP4 / M4A): offset 4..8 == 'ftyp'
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    const isAudioBrand = brand === 'M4A ' || brand === 'M4B ';
    if (
      declaredMime === 'audio/mp4' ||
      declaredMime === 'audio/m4a' ||
      declaredMime === 'audio/x-m4a' ||
      (isGenericMime && ext === '.m4a') ||
      (isAudioBrand && ext === '.m4a')
    ) {
      return { ok: true, canonicalMime: 'audio/mp4', modality: 'audio', ext: '.m4a' };
    }
    if (declaredMime === 'video/mp4' || (isGenericMime && ext === '.mp4')) {
      return { ok: true, canonicalMime: 'video/mp4', modality: 'video', ext: '.mp4' };
    }
  }

  // 9. EBML / WebM: 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    if (declaredMime === 'audio/webm') {
      return { ok: true, canonicalMime: 'audio/webm', modality: 'audio', ext: '.webm' };
    }
    if (declaredMime === 'video/webm' || (isGenericMime && ext === '.webm')) {
      return { ok: true, canonicalMime: 'video/webm', modality: 'video', ext: '.webm' };
    }
  }

  return { ok: false, reason: 'Unsupported file signature or MIME type mismatch.' };
}
