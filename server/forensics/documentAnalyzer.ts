import zlib from 'node:zlib';
import { sanitizeText } from '../security/sanitize.ts';

export interface DocumentForensicMetrics {
  documentType: 'pdf' | 'text';
  pdfVersion: string | null;
  estimatedPages: number | null;
  author: string | null;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modDate: string | null;
  hasEmbeddedScripts: boolean;
  incrementalUpdatesCount: number;
  lineCount: number;
  wordCount: number;
  charCount: number;
  extractedExcerpt: string;
}

function extractPdfInfoValue(raw: string, key: string): string | null {
  const regex = new RegExp(`/${key}\\s*\\(([^)]{1,200})\\)`, 'i');
  const match = raw.match(regex);
  if (!match?.[1]) return null;
  return sanitizeText(match[1].replace(/\\([()\\])/g, '$1'), 160) || null;
}

function extractPdfTextFromContentStream(streamText: string, out: string[]) {
  // Match Tj single strings: (Hello world) Tj
  const tjRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tjRegex.exec(streamText)) !== null && out.length < 80) {
    const clean = sanitizeText(m[1].replace(/\\([()\\])/g, '$1'), 180);
    if (clean && clean.length >= 2) out.push(clean);
  }
  // Match TJ arrays: [(Hello) -10 (world)] TJ
  const tjArrRegex = /\[([^\]]{1,800})\]\s*TJ/g;
  while ((m = tjArrRegex.exec(streamText)) !== null && out.length < 80) {
    const inner = m[1];
    const parts: string[] = [];
    const strRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRegex.exec(inner)) !== null) {
      parts.push(sm[1].replace(/\\([()\\])/g, '$1'));
    }
    const joined = sanitizeText(parts.join(''), 200);
    if (joined && joined.length >= 2) out.push(joined);
  }
}

export function analyzeDocumentBuffer(
  buf: Buffer,
  mimeType: string,
): DocumentForensicMetrics {
  if (mimeType === 'application/pdf') {
    const latin = buf.toString('latin1');
    const verMatch = latin.match(/^%PDF-(\d\.\d)/);
    const pdfVersion = verMatch?.[1] ?? null;

    const pageMatches = latin.match(/\/Type\s*\/Page\b/g);
    const estimatedPages = pageMatches ? pageMatches.length : null;

    const eofMatches = latin.match(/%%EOF/g);
    const incrementalUpdatesCount = eofMatches ? Math.max(0, eofMatches.length - 1) : 0;

    const hasEmbeddedScripts = /\/(JavaScript|JS|OpenAction|Launch)\b/.test(latin);

    const author = extractPdfInfoValue(latin, 'Author');
    const creator = extractPdfInfoValue(latin, 'Creator');
    const producer = extractPdfInfoValue(latin, 'Producer');
    const creationDate = extractPdfInfoValue(latin, 'CreationDate');
    const modDate = extractPdfInfoValue(latin, 'ModDate');
    const title = extractPdfInfoValue(latin, 'Title');

    const textSnippets: string[] = [];

    // 1. Decompress FlateDecode streams safely to read real compressed PDF body text
    const streamRegex = /<<([\s\S]{0,600}?)>>\s*stream\r?\n/g;
    let smMatch: RegExpExecArray | null;
    let streamsChecked = 0;
    while ((smMatch = streamRegex.exec(latin)) !== null && streamsChecked < 24 && textSnippets.length < 80) {
      streamsChecked++;
      const dict = smMatch[1];
      const startIdx = smMatch.index + smMatch[0].length;
      const endIdx = latin.indexOf('endstream', startIdx);
      if (endIdx <= startIdx) continue;
      const rawSlice = buf.subarray(startIdx, Math.min(endIdx, startIdx + 256 * 1024));
      if (/\/FlateDecode\b/.test(dict)) {
        try {
          const inflated = zlib.inflateSync(rawSlice).toString('latin1');
          extractPdfTextFromContentStream(inflated, textSnippets);
        } catch {
          // Try raw inflate fallback for streams without zlib wrapper
          try {
            const inflatedRaw = zlib.inflateRawSync(rawSlice).toString('latin1');
            extractPdfTextFromContentStream(inflatedRaw, textSnippets);
          } catch {
            // Skip non-text / image / font streams cleanly
          }
        }
      } else {
        extractPdfTextFromContentStream(rawSlice.toString('latin1'), textSnippets);
      }
    }

    // 2. Fallback: Extract readable ASCII text literals inside uncompressed parentheses
    if (textSnippets.length === 0) {
      const litRegex = /\(([A-Za-z0-9 ,.;:'"!?/@#%&()\-]{4,120})\)/g;
      let m: RegExpExecArray | null;
      while ((m = litRegex.exec(latin)) !== null && textSnippets.length < 40) {
        const cleaned = sanitizeText(m[1], 140);
        if (cleaned && !cleaned.startsWith('D:')) {
          textSnippets.push(cleaned);
        }
      }
    }

    const excerpt = sanitizeText(
      [title ? `Title: ${title}` : '', textSnippets.join(' ')].filter(Boolean).join(' — '),
      1200,
    );

    return {
      documentType: 'pdf',
      pdfVersion,
      estimatedPages,
      author,
      creator,
      producer,
      creationDate,
      modDate,
      hasEmbeddedScripts,
      incrementalUpdatesCount,
      lineCount: excerpt ? excerpt.split('\n').length : 0,
      wordCount: excerpt ? excerpt.split(/\s+/).filter(Boolean).length : 0,
      charCount: buf.length,
      extractedExcerpt:
        excerpt || 'PDF metadata header inspected (image-only or custom-encoded streams without extractable ASCII text).',
    };
  }

  // Plain text forensic document
  const text = sanitizeText(buf.toString('utf8'), 12000);
  const lines = text ? text.split(/\r?\n/) : [];
  const words = text ? text.split(/\s+/).filter(Boolean) : [];

  return {
    documentType: 'text',
    pdfVersion: null,
    estimatedPages: null,
    author: null,
    creator: null,
    producer: null,
    creationDate: null,
    modDate: null,
    hasEmbeddedScripts: false,
    incrementalUpdatesCount: 0,
    lineCount: lines.length,
    wordCount: words.length,
    charCount: text.length,
    extractedExcerpt: text.slice(0, 1200),
  };
}
