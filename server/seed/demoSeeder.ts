import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { SEED_DIR, UPLOADS_DIR, db } from '../db/index.ts';
import {
  cases,
  evidenceItems,
  findings,
  graphNodes,
  graphEdges,
  communityVotes,
} from '../db/schema.ts';
import { analyzeImageBuffer } from '../forensics/imageAnalyzer.ts';
import { analyzeAudioBuffer } from '../forensics/audioAnalyzer.ts';
import { appendCustodyEntry, computeSha256 } from '../forensics/ledger.ts';
import { eq } from 'drizzle-orm';

export const PUBLIC_BENCHMARK_TOPIC = 'demo-benchmark-case';

/**
 * Builds a minimal, standards-compliant JPEG APP1 EXIF segment containing
 * Make, Model, Software, DateTimeOriginal, and Mumbai GPS coordinates (19.0760 N, 72.8777 E).
 */
function buildExifSegmentBuffer(): Buffer {
  const entries0th: Array<{ tag: number; type: number; count: number; valueOrData: Buffer }> = [];
  const entriesExif: Array<{ tag: number; type: number; count: number; valueOrData: Buffer }> = [];
  const entriesGps: Array<{ tag: number; type: number; count: number; valueOrData: Buffer }> = [];

  const ascii = (s: string) => Buffer.from(`${s}\0`, 'ascii');
  const rational = (num: number, den: number) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(num, 0);
    b.writeUInt32LE(den, 4);
    return b;
  };
  const dms = (deg: number, min: number, secTimes100: number) =>
    Buffer.concat([rational(deg, 1), rational(min, 1), rational(secTimes100, 100)]);

  entries0th.push({ tag: 0x010f, type: 2, count: 6, valueOrData: ascii('Canon') }); // Make
  entries0th.push({ tag: 0x0110, type: 2, count: 13, valueOrData: ascii('Canon EOS R6') }); // Model
  entries0th.push({
    tag: 0x0131,
    type: 2,
    count: 21,
    valueOrData: ascii('Adobe Photoshop 24.1'),
  }); // Software
  entries0th.push({ tag: 0x0132, type: 2, count: 20, valueOrData: ascii('2023:07:22 18:15:00') }); // ModifyDate

  entriesExif.push({ tag: 0x9003, type: 2, count: 20, valueOrData: ascii('2023:07:22 18:15:00') }); // DateTimeOriginal

  // Mumbai GPS: 19 deg 4 min 33.60 sec N, 72 deg 52 min 39.72 sec E
  entriesGps.push({ tag: 0x0001, type: 2, count: 2, valueOrData: ascii('N') });
  entriesGps.push({ tag: 0x0002, type: 5, count: 3, valueOrData: dms(19, 4, 3360) });
  entriesGps.push({ tag: 0x0003, type: 2, count: 2, valueOrData: ascii('E') });
  entriesGps.push({ tag: 0x0004, type: 5, count: 3, valueOrData: dms(72, 52, 3972) });

  // Reserve 2 pointer entries in IFD0 for ExifIFDPointer (0x8769) and GPSInfoIFDPointer (0x8825)
  const ifd0Count = entries0th.length + 2;
  const ifd0Offset = 8; // immediately after TIFF header
  const ifd0Size = 2 + ifd0Count * 12 + 4;

  const exifIfdOffset = ifd0Offset + ifd0Size;
  const exifIfdSize = 2 + entriesExif.length * 12 + 4;

  const gpsIfdOffset = exifIfdOffset + exifIfdSize;
  const gpsIfdSize = 2 + entriesGps.length * 12 + 4;

  let dataCursor = gpsIfdOffset + gpsIfdSize;
  const extraChunks: Buffer[] = [];

  const packIfd = (
    entries: Array<{ tag: number; type: number; count: number; valueOrData: Buffer }>,
    extraPointers: Array<{ tag: number; targetOffset: number }> = [],
  ) => {
    const total = entries.length + extraPointers.length;
    const buf = Buffer.alloc(2 + total * 12 + 4);
    buf.writeUInt16LE(total, 0);
    let idx = 0;

    for (const e of entries) {
      const base = 2 + idx * 12;
      buf.writeUInt16LE(e.tag, base);
      buf.writeUInt16LE(e.type, base + 2);
      buf.writeUInt32LE(e.count, base + 4);
      if (e.valueOrData.length <= 4) {
        e.valueOrData.copy(buf, base + 8);
      } else {
        buf.writeUInt32LE(dataCursor, base + 8);
        extraChunks.push(e.valueOrData);
        dataCursor += e.valueOrData.length;
      }
      idx++;
    }

    for (const p of extraPointers) {
      const base = 2 + idx * 12;
      buf.writeUInt16LE(p.tag, base);
      buf.writeUInt16LE(4, base + 2); // LONG
      buf.writeUInt32LE(1, base + 4);
      buf.writeUInt32LE(p.targetOffset, base + 8);
      idx++;
    }

    buf.writeUInt32LE(0, 2 + total * 12); // next IFD = 0
    return buf;
  };

  const tiffHeader = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]); // Little-endian TIFF
  const ifd0Buf = packIfd(entries0th, [
    { tag: 0x8769, targetOffset: exifIfdOffset },
    { tag: 0x8825, targetOffset: gpsIfdOffset },
  ]);
  const exifBuf = packIfd(entriesExif);
  const gpsBuf = packIfd(entriesGps);

  const tiffPayload = Buffer.concat([tiffHeader, ifd0Buf, exifBuf, gpsBuf, ...extraChunks]);
  const app1Header = Buffer.from('Exif\0\0', 'ascii');
  const segmentBody = Buffer.concat([app1Header, tiffPayload]);
  const marker = Buffer.alloc(4);
  marker[0] = 0xff;
  marker[1] = 0xe1;
  marker.writeUInt16BE(segmentBody.length + 2, 2);
  return Buffer.concat([marker, segmentBody]);
}

function injectExifIntoJpeg(jpegBuffer: Buffer): Buffer {
  if (jpegBuffer[0] !== 0xff || jpegBuffer[1] !== 0xd8) {
    throw new Error('Expected JPEG buffer');
  }
  const exifSegment = buildExifSegmentBuffer();
  return Buffer.concat([jpegBuffer.subarray(0, 2), exifSegment, jpegBuffer.subarray(2)]);
}

/**
 * Synthesizes a 5-second 16kHz mono 16-bit PCM WAV containing speech-like
 * formant sweeps with a deliberate mid-clip splice/frequency jump at 2.60s - 3.85s.
 */
function buildDemoWavBuffer(): Buffer {
  const sampleRate = 16000;
  const durationSec = 5;
  const numSamples = sampleRate * durationSec;
  const pcm = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (t >= 2.6 && t <= 3.85) {
      // Synthetic vocoder-like harmonic segment with dead noise floor and buzzier upper formants
      const f0 = 195;
      sample =
        0.38 * Math.sin(2 * Math.PI * f0 * t) +
        0.24 * Math.sin(2 * Math.PI * (f0 * 3) * t) +
        0.16 * Math.sin(2 * Math.PI * (f0 * 7) * t) +
        0.09 * Math.sin(2 * Math.PI * (f0 * 11) * t);
    } else {
      // Natural-like modulated cadence with subtle ambient street rumble
      const env = 0.55 + 0.45 * Math.sin(2 * Math.PI * 2.4 * t);
      const f0 = 132 + 18 * Math.sin(2 * Math.PI * 1.3 * t);
      const ambient =
        0.05 * Math.sin(2 * Math.PI * 62 * t) +
        0.03 * Math.sin(2 * Math.PI * 118 * t) +
        0.02 * Math.sin(2 * Math.PI * 410 * t);
      sample =
        env *
          (0.28 * Math.sin(2 * Math.PI * f0 * t) +
            0.14 * Math.sin(2 * Math.PI * (f0 * 2) * t) +
            0.07 * Math.sin(2 * Math.PI * (f0 * 3) * t)) +
        ambient;
    }

    const clamped = Math.max(-0.98, Math.min(0.98, sample));
    pcm.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM
  header.writeUInt16LE(1, 20); // Linear PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export async function ensureSeedArtifactsOnDisk(): Promise<{
  imagePath: string;
  audioPath: string;
}> {
  const imagePath = path.join(SEED_DIR, 'demo_street_evidence.jpg');
  const audioPath = path.join(SEED_DIR, 'demo_witness_audio.wav');

  if (!fs.existsSync(imagePath)) {
    const assetsDir = path.resolve(process.cwd(), 'src', 'assets', 'images');
    let sourceImg: Buffer | null = null;
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir).filter((f) => f.startsWith('demo_street_evidence'));
      if (files.length > 0) {
        sourceImg = fs.readFileSync(path.join(assetsDir, files[0]));
      }
    }

    // Fallback synthetic gradient street image if asset missing
    const baseSharp = sourceImg
      ? sharp(sourceImg).resize(960, 720, { fit: 'cover' })
      : sharp({
          create: {
            width: 960,
            height: 720,
            channels: 3,
            background: { r: 22, g: 30, b: 48 },
          },
        });

    // Save main image at Q=72, then composite a Q=99 high-contrast patch on lower-right to create genuine ELA differential
    const baseBuffer = await baseSharp.jpeg({ quality: 72 }).toBuffer();
    const patchRegion = await sharp(baseBuffer)
      .extract({ left: 560, top: 420, width: 320, height: 220 })
      .modulate({ brightness: 1.08, saturation: 1.15 })
      .sharpen({ sigma: 1.6 })
      .jpeg({ quality: 99 })
      .toBuffer();

    const composited = await sharp(baseBuffer)
      .composite([{ input: patchRegion, left: 560, top: 420 }])
      .jpeg({ quality: 95 })
      .toBuffer();

    const withExif = injectExifIntoJpeg(composited);
    fs.writeFileSync(imagePath, withExif);
  }

  if (!fs.existsSync(audioPath)) {
    fs.writeFileSync(audioPath, buildDemoWavBuffer());
  }

  return { imagePath, audioPath };
}

export async function provisionDemoCaseForUser(userId: string): Promise<string> {
  const existing = await db
    .select()
    .from(cases)
    .where(eq(cases.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const { imagePath, audioPath } = await ensureSeedArtifactsOnDisk();
  const imgBuf = fs.readFileSync(imagePath);
  const audBuf = fs.readFileSync(audioPath);

  const imgMetrics = await analyzeImageBuffer(imgBuf);
  const audMetrics = analyzeAudioBuffer(audBuf, 'audio/wav');

  const now = Date.now();
  const caseId = crypto.randomUUID();
  const imgId = crypto.randomUUID();
  const audId = crypto.randomUUID();
  const txtId = crypto.randomUUID();

  const storedImgName = `${crypto.randomUUID()}.jpg`;
  const storedAudName = `${crypto.randomUUID()}.wav`;
  fs.writeFileSync(path.join(UPLOADS_DIR, storedImgName), imgBuf);
  fs.writeFileSync(path.join(UPLOADS_DIR, storedAudName), audBuf);

  const imgSha = computeSha256(imgBuf);
  const audSha = computeSha256(audBuf);
  const captionText =
    'Witness report: Heavy monsoon flooding on MG Road, Bengaluru recorded yesterday on November 18, 2026 at 18:40 IST. Verified live witness audio attached.';
  const txtSha = computeSha256(Buffer.from(captionText, 'utf8'));

  await db.insert(cases).values({
    id: caseId,
    userId,
    title: 'Case TL-2026-04: Monsoon Street Claim vs. EXIF & Acoustic Indicators',
    description:
      'Seeded demonstration case containing a street photograph with Mumbai EXIF/RTO markers, a localized ELA compression differential, a 5s witness audio recording with a mid-clip spectral discontinuity, and a conflicting Bengaluru 2026 caption.',
    captionText,
    isDemoSeed: 1,
    riskLevel: 'High',
    confidenceMin: 71,
    confidenceMax: 88,
    summary:
      'Cross-modal inspection flags elevated discrepancy indicators across metadata, visual compression, and acoustic continuity. The caption asserts Bengaluru in November 2026, whereas embedded EXIF GPS (19.0760 N, 72.8777 E), EXIF timestamp (2023-07-22), and visible MH-02 vehicle signage align with Mumbai in July 2023. Localized ELA variance in the Lower-Right sector and a 2.60s-3.85s harmonic splice in the audio warrant manual source verification rather than treating the bundle as conclusive proof.',
    limitationsJson: JSON.stringify([
      'ELA differentials can be triggered by legitimate selective sharpening, social-media re-encoding, or sticker overlays.',
      'EXIF headers can be stripped, inherited from edited templates, or altered by camera clock misconfiguration.',
      'Synthetic-speech acoustic heuristics cannot distinguish a vocoder splice from aggressive mobile VoIP noise suppression without raw PCM provenance.',
      'Results are calibrated indicators from signal heuristics and Gemini 2.5 Flash, never definitive legal proof.',
    ]),
    alternativesJson: JSON.stringify([
      'A journalist or bystander may have accidentally uploaded an archived July 2023 Mumbai photo alongside a November 2026 Bengaluru news update.',
      'Adobe Photoshop 24.1 software tag could reflect routine brightness/contrast color-grading for web publication rather than deceptive content insertion.',
      'The 2.60s-3.85s audio discontinuity could stem from a Bluetooth hands-free codec bitrate drop or cellular packet-loss concealment.',
    ]),
    recommendedChecksJson: JSON.stringify([
      'Request original camera RAW (.CR3/.DNG) or unedited messaging-app source file to confirm sensor origin.',
      'Cross-check municipal rainfall logs and traffic CCTV for MG Road Bengaluru (Nov 18, 2026) vs. Mumbai MH-02 corridor (Jul 22, 2023).',
      'Inspect Shop signage ("Sharma Sweets") via street-level directory records to verify physical street block.',
      'Obtain multi-angle corroborating witness footage recorded during the claimed timeframe.',
    ]),
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(evidenceItems).values([
    {
      id: imgId,
      caseId,
      userId,
      modality: 'image',
      originalFilename: 'monsoon_street_witness.jpg',
      storedFilename: storedImgName,
      elaFilename: imgMetrics.elaFilename,
      fftFilename: imgMetrics.fftFilename,
      mimeType: 'image/jpeg',
      byteSize: imgBuf.length,
      sha256: imgSha,
      perceptualHash: imgMetrics.perceptualHash,
      exifJson: JSON.stringify(imgMetrics.exifSummary),
      metricsJson: JSON.stringify({
        width: imgMetrics.width,
        height: imgMetrics.height,
        elaMean: imgMetrics.elaMean,
        elaMax: imgMetrics.elaMax,
        elaP95: imgMetrics.elaP95,
        blockVarianceRatio: imgMetrics.blockVarianceRatio,
        hotspotSector: imgMetrics.hotspotSector,
        fftHighFreqRatio: imgMetrics.fftHighFreqRatio,
        fftPeriodicPeakScore: imgMetrics.fftPeriodicPeakScore,
      }),
      framesJson: null,
      transcript: null,
      createdAt: now,
    },
    {
      id: audId,
      caseId,
      userId,
      modality: 'audio',
      originalFilename: 'witness_voice_memo.wav',
      storedFilename: storedAudName,
      elaFilename: null,
      fftFilename: null,
      mimeType: 'audio/wav',
      byteSize: audBuf.length,
      sha256: audSha,
      perceptualHash: null,
      exifJson: null,
      metricsJson: JSON.stringify(audMetrics),
      framesJson: null,
      transcript:
        '[Acoustic speech-formant clip; 00:00.0-00:02.6 ambient modulated cadence; 00:02.6-00:03.85 steady-pitch harmonic synth/splice window with absent ambient street floor; 00:03.85-00:05.0 return to ambient cadence.]',
      createdAt: now + 1,
    },
    {
      id: txtId,
      caseId,
      userId,
      modality: 'text',
      originalFilename: 'social_caption.txt',
      storedFilename: null,
      elaFilename: null,
      fftFilename: null,
      mimeType: 'text/plain',
      byteSize: Buffer.byteLength(captionText, 'utf8'),
      sha256: txtSha,
      perceptualHash: null,
      exifJson: null,
      metricsJson: JSON.stringify({ charCount: captionText.length, wordCount: 22 }),
      framesJson: null,
      transcript: captionText,
      createdAt: now + 2,
    },
  ]);

  const f1 = crypto.randomUUID();
  const f2 = crypto.randomUUID();
  const f3 = crypto.randomUUID();
  const f4 = crypto.randomUUID();

  await db.insert(findings).values([
    {
      id: f1,
      caseId,
      evidenceId: imgId,
      modality: 'image',
      indicator: 'Geolocation & Date EXIF Contradiction',
      whyFlagged:
        'Embedded EXIF GPS coordinates (19.0760 N, 72.8777 E — Mumbai) and DateTimeOriginal (2023-07-22T18:15:00Z) conflict directly with the caption claiming Bengaluru on November 18, 2026.',
      locationOrTimestamp: 'EXIF IFD0 / GPSInfo',
      confidenceRange: '78% - 92%',
      limitation:
        'EXIF metadata can be edited, copied from a previous export, or reflect an unsynchronized camera clock.',
      severity: 'High',
      createdAt: now,
    },
    {
      id: f2,
      caseId,
      evidenceId: imgId,
      modality: 'image',
      indicator: 'Localized ELA Compression Differential',
      whyFlagged: `Error Level Analysis detected a ${imgMetrics.blockVarianceRatio}x compression variance concentrated in the ${imgMetrics.hotspotSector} sector (ELA max ${imgMetrics.elaMax}), alongside Adobe Photoshop 24.1 software metadata.`,
      locationOrTimestamp: `Region: ${imgMetrics.hotspotSector} (x:560..880, y:420..640)`,
      confidenceRange: '66% - 83%',
      limitation:
        'Selective contrast enhancement, sharpening, or local exposure dodging in photo editors produces similar ELA differentials without content insertion.',
      severity: 'Medium',
      createdAt: now + 1,
    },
    {
      id: f3,
      caseId,
      evidenceId: audId,
      modality: 'audio',
      indicator: 'Mid-Clip Spectral & Noise-Floor Discontinuity',
      whyFlagged:
        'Time-frequency inspection shows an abrupt drop in low-frequency street ambiance paired with rigid harmonic spacing (f0=195 Hz) between 02.60s and 03.85s.',
      locationOrTimestamp: '00:02.60 - 00:03.85',
      confidenceRange: '62% - 80%',
      limitation:
        'Cellular AMR/Opus packet-loss concealment or aggressive noise-gate filtering can create brief robotic harmonic intervals.',
      severity: 'High',
      createdAt: now + 2,
    },
    {
      id: f4,
      caseId,
      evidenceId: txtId,
      modality: 'text',
      indicator: 'Visual Signage vs. Caption Location Mismatch',
      whyFlagged:
        'Auto-rickshaw license plate prefix (MH 02) and storefront signage align with Mumbai West rather than MG Road, Bengaluru.',
      locationOrTimestamp: 'Caption Claim · Center-Right Frame',
      confidenceRange: '74% - 89%',
      limitation:
        'Inter-state vehicles occasionally operate outside home registration zones, though commercial three-wheelers rarely travel 980 km.',
      severity: 'High',
      createdAt: now + 3,
    },
  ]);

  await db.insert(graphNodes).values([
    {
      id: crypto.randomUUID(),
      caseId,
      nodeKey: 'ev_image',
      label: 'Street Photo (JPEG)',
      nodeType: 'evidence',
      modality: 'image',
      details: `SHA-256 ${imgSha.slice(0, 14)}... · dHash ${imgMetrics.perceptualHash}`,
    },
    {
      id: crypto.randomUUID(),
      caseId,
      nodeKey: 'ev_audio',
      label: 'Witness Audio (WAV)',
      nodeType: 'evidence',
      modality: 'audio',
      details: `5.0s · 16kHz PCM · Discontinuity at 2.60s-3.85s`,
    },
    {
      id: crypto.randomUUID(),
      caseId,
      nodeKey: 'ev_caption',
      label: 'Caption Text',
      nodeType: 'evidence',
      modality: 'text',
      details: captionText,
    },
    {
      id: crypto.randomUUID(),
      caseId,
      nodeKey: 'claim_location',
      label: 'Claim: Bengaluru (Nov 2026)',
      nodeType: 'claim',
      modality: 'text',
      details: 'Caption asserts MG Road, Bengaluru on November 18, 2026.',
    },
    {
      id: crypto.randomUUID(),
      caseId,
      nodeKey: 'meta_exif',
      label: 'EXIF: Mumbai (Jul 2023)',
      nodeType: 'metadata',
      modality: 'image',
      details: 'Canon EOS R6 · Photoshop 24.1 · GPS 19.0760 N, 72.8777 E · 2023-07-22',
    },
    {
      id: crypto.randomUUID(),
      caseId,
      nodeKey: 'visual_rto',
      label: 'Visual Cue: MH-02 Plate',
      nodeType: 'metadata',
      modality: 'image',
      details: 'Visible MH 02 AB 1234 auto-rickshaw plate (Mumbai West RTO).',
    },
  ]);

  await db.insert(graphEdges).values([
    {
      id: crypto.randomUUID(),
      caseId,
      sourceKey: 'ev_caption',
      targetKey: 'claim_location',
      relation: 'corroborates',
      label: 'Asserts claim',
      explanation: 'Caption explicitly states MG Road, Bengaluru on Nov 18, 2026.',
      confidenceRange: '90% - 99%',
      limitation: 'Reflects uploader text assertion only, not verified telemetry.',
    },
    {
      id: crypto.randomUUID(),
      caseId,
      sourceKey: 'meta_exif',
      targetKey: 'claim_location',
      relation: 'contradicts',
      label: 'GPS & Date Conflict',
      explanation:
        'EXIF coordinates (19.0760 N, 72.8777 E) map to Mumbai and DateTimeOriginal reads 2023-07-22, contradicting Bengaluru Nov 2026.',
      confidenceRange: '78% - 92%',
      limitation: 'EXIF timestamps and GPS can be modified or inherited from prior exports.',
    },
    {
      id: crypto.randomUUID(),
      caseId,
      sourceKey: 'visual_rto',
      targetKey: 'meta_exif',
      relation: 'corroborates',
      label: 'Regional Plate Match',
      explanation:
        'Visible MH-02 Mumbai registration plate corroborates the Mumbai GPS coordinates stored in EXIF.',
      confidenceRange: '76% - 90%',
      limitation: 'Visual registration codes require clear legibility check against distortion.',
    },
    {
      id: crypto.randomUUID(),
      caseId,
      sourceKey: 'visual_rto',
      targetKey: 'claim_location',
      relation: 'contradicts',
      label: 'Location Mismatch',
      explanation: 'Mumbai regional vehicle registration conflicts with the Bengaluru location claim.',
      confidenceRange: '74% - 89%',
      limitation: 'Does not rule out an out-of-state vehicle, though unlikely for local auto-rickshaws.',
    },
    {
      id: crypto.randomUUID(),
      caseId,
      sourceKey: 'ev_image',
      targetKey: 'meta_exif',
      relation: 'corroborates',
      label: 'Embedded Header',
      explanation: 'Original uploaded JPEG file header directly contains the parsed EXIF IFD0 & GPS records.',
      confidenceRange: '92% - 99%',
      limitation: 'Header presence does not prove sensor capture authenticity.',
    },
    {
      id: crypto.randomUUID(),
      caseId,
      sourceKey: 'ev_audio',
      targetKey: 'claim_location',
      relation: 'inconclusive',
      label: 'Unverified Splice (2.6s-3.85s)',
      explanation:
        'Mid-clip harmonic shift and missing street noise floor at 2.60s-3.85s prevent verifying continuous live ambient recording.',
      confidenceRange: '62% - 80%',
      limitation: 'VoIP/Bluetooth noise gating can cause comparable spectral shifts.',
    },
  ]);

  // Chain-of-custody entries (sequential SHA-256 hash chain)
  await appendCustodyEntry({
    caseId,
    userId,
    evidenceId: imgId,
    action: 'INGEST_ORIGINAL',
    fileSha256: imgSha,
    createdAt: now,
  });
  await appendCustodyEntry({
    caseId,
    userId,
    evidenceId: audId,
    action: 'INGEST_ORIGINAL',
    fileSha256: audSha,
    createdAt: now + 1,
  });
  await appendCustodyEntry({
    caseId,
    userId,
    evidenceId: txtId,
    action: 'INGEST_ORIGINAL',
    fileSha256: txtSha,
    createdAt: now + 2,
  });
  await appendCustodyEntry({
    caseId,
    userId,
    evidenceId: null,
    action: 'FORENSIC_ANALYSIS_COMMIT',
    fileSha256: computeSha256(Buffer.from(`${imgSha}:${audSha}:${txtSha}`, 'utf8')),
    createdAt: now + 3,
  });

  return caseId;
}

export async function ensureCommunitySeedVotes(seedUserId: string) {
  const existing = await db
    .select()
    .from(communityVotes)
    .where(eq(communityVotes.topicKey, PUBLIC_BENCHMARK_TOPIC))
    .limit(1);

  if (existing.length > 0) return;

  const now = Date.now();
  await db.insert(communityVotes).values([
    {
      id: crypto.randomUUID(),
      topicKey: PUBLIC_BENCHMARK_TOPIC,
      userId: seedUserId,
      voterName: 'Peer Reviewer A (OSINT)',
      stance: 'plausible_artifact',
      rationale:
        'MH-02 plate + Mumbai GPS + 2023 EXIF date strongly align against the Nov 2026 Bengaluru caption.',
      createdAt: now - 180000,
    },
    {
      id: crypto.randomUUID(),
      topicKey: PUBLIC_BENCHMARK_TOPIC,
      userId: seedUserId,
      voterName: 'Peer Reviewer B (Audio Lab)',
      stance: 'needs_corroboration',
      rationale:
        'The 2.60s-3.85s audio discontinuity is suspicious, though Bluetooth codec drop should be ruled out with raw source.',
      createdAt: now - 90000,
    },
  ]);
}
