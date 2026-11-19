import { sanitizeText } from '../security/sanitize.ts';

export type CorrelationStatus =
  | 'supporting'
  | 'contradictory'
  | 'inconclusive'
  | 'insufficient_evidence';

export interface CrossModalCorrelationItem {
  id: string;
  pairKey:
    | 'image_vs_video'
    | 'video_vs_audio'
    | 'audio_vs_transcript'
    | 'caption_vs_visual'
    | 'date_vs_metadata'
    | 'location_vs_context';
  pairLabel: string;
  status: CorrelationStatus;
  supportingSignals: string[];
  contradictorySignals: string[];
  relatedEvidence: Array<{ id: string; filename: string; modality: string }>;
  confidenceRange: string;
  uncertaintyNote: string;
  alternativeExplanations: string[];
}

export interface ManipulationIndicatorItem {
  id: string;
  category: 'image_region' | 'video_frame' | 'audio_discontinuity' | 'metadata' | 'text_context';
  severity: 'Low' | 'Medium' | 'High';
  whatDetected: string;
  whereDetected: string;
  timestampOrRegion: string;
  whyFlagged: string;
  supportingEvidence: string;
  innocentExplanation: string;
}

export interface CrossModalFindingDraft {
  evidenceId: string;
  modality: 'image' | 'video' | 'audio' | 'text' | 'document';
  indicator: string;
  whyFlagged: string;
  locationOrTimestamp: string;
  confidenceRange: string;
  limitation: string;
  severity: 'Low' | 'Medium' | 'High';
}

export interface CrossModalGraphNodeDraft {
  nodeKey: string;
  label: string;
  nodeType: 'evidence' | 'claim' | 'metadata';
  modality: string;
  details: string;
}

export interface CrossModalGraphEdgeDraft {
  sourceKey: string;
  targetKey: string;
  relation: 'corroborates' | 'contradicts' | 'inconclusive';
  label: string;
  explanation: string;
  confidenceRange: string;
  limitation: string;
}

export interface EvidenceRowSnapshot {
  id: string;
  modality: string;
  originalFilename: string;
  mimeType: string;
  sha256: string;
  perceptualHash: string | null;
  exifJson: string | null;
  metricsJson: string | null;
  framesJson: string | null;
  transcript: string | null;
}

export interface DeterministicForensicResult {
  riskLevel: 'Low' | 'Medium' | 'High';
  confidenceMin: number;
  confidenceMax: number;
  summary: string;
  correlations: CrossModalCorrelationItem[];
  manipulationIndicators: ManipulationIndicatorItem[];
  findings: CrossModalFindingDraft[];
  graphNodes: CrossModalGraphNodeDraft[];
  graphEdges: CrossModalGraphEdgeDraft[];
  limitations: string[];
  alternativeExplanations: string[];
  recommendedChecks: string[];
}

interface ParsedExif {
  make?: string | null;
  model?: string | null;
  software?: string | null;
  dateTimeOriginal?: string | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  hasExif?: boolean;
}

interface ParsedImageMetrics {
  width?: number;
  height?: number;
  elaMean?: number;
  elaMax?: number;
  elaP95?: number;
  blockVarianceRatio?: number;
  hotspotSector?: string;
  fftHighFreqRatio?: number;
  fftPeriodicPeakScore?: number;
  suspiciousRegions?: Array<{
    sector: string;
    meanError: number;
    ratioToMedian: number;
    severity: 'Low' | 'Medium' | 'High';
    note: string;
  }>;
}

interface ParsedAudioMetrics {
  sampleRate?: number | null;
  channels?: number | null;
  bitrateKbps?: number | null;
  durationSec?: number | null;
  rmsDb?: number | null;
  segmentEnergyVariance?: number | null;
  syntheticSpeechIndicators?: string[];
  discontinuityWindows?: Array<{
    startSec: number;
    endSec: number;
    deltaDb: number;
    note: string;
  }>;
}

interface ParsedVideoMetrics {
  containerFormat?: string;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  hasAudioTrack?: boolean | null;
  creationTimestamp?: string | null;
  frameCount?: number;
  suspiciousCount?: number;
  maxFrameDelta?: number;
  flaggedTimestamps?: number[];
  audioSyncNote?: string | null;
}

interface ParsedDocMetrics {
  documentType?: 'pdf' | 'text';
  pdfVersion?: string | null;
  estimatedPages?: number | null;
  author?: string | null;
  creator?: string | null;
  producer?: string | null;
  creationDate?: string | null;
  modDate?: string | null;
  hasEmbeddedScripts?: boolean;
  incrementalUpdatesCount?: number;
  extractedExcerpt?: string;
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const KNOWN_CITIES: Array<{
  name: string;
  aliases: RegExp;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}> = [
  { name: 'Mumbai', aliases: /\b(mumbai|bombay|andheri|bandra|dadar|mh[- ]?0[1-4])\b/i, latMin: 18.85, latMax: 19.32, lonMin: 72.74, lonMax: 73.08 },
  { name: 'Bengaluru', aliases: /\b(bengaluru|bangalore|mg road|koramangala|whitefield|ka[- ]?0[1-5])\b/i, latMin: 12.75, latMax: 13.18, lonMin: 77.42, lonMax: 77.82 },
  { name: 'New Delhi', aliases: /\b(delhi|new delhi|connaught|dl[- ]?0[1-9])\b/i, latMin: 28.4, latMax: 28.88, lonMin: 76.84, lonMax: 77.35 },
  { name: 'Chennai', aliases: /\b(chennai|madras|t\.?\s?nagar|tn[- ]?0[1-9])\b/i, latMin: 12.88, latMax: 13.25, lonMin: 80.12, lonMax: 80.35 },
  { name: 'Hyderabad', aliases: /\b(hyderabad|secunderabad|charminar|ts[- ]?0[7-9])\b/i, latMin: 17.22, latMax: 17.58, lonMin: 78.24, lonMax: 78.66 },
  { name: 'Kolkata', aliases: /\b(kolkata|calcutta|howrah|wb[- ]?0[1-8])\b/i, latMin: 22.42, latMax: 22.7, lonMin: 88.24, lonMax: 88.48 },
  { name: 'London', aliases: /\b(london|westminster|thames)\b/i, latMin: 51.28, latMax: 51.69, lonMin: -0.51, lonMax: 0.33 },
  { name: 'New York', aliases: /\b(new york|manhattan|brooklyn|nyc)\b/i, latMin: 40.48, latMax: 40.92, lonMin: -74.26, lonMax: -73.7 },
];

function resolveCityFromGps(lat: number, lon: number): string | null {
  for (const city of KNOWN_CITIES) {
    if (lat >= city.latMin && lat <= city.latMax && lon >= city.lonMin && lon <= city.lonMax) {
      return city.name;
    }
  }
  return null;
}

function extractClaimedCities(text: string): string[] {
  const hits: string[] = [];
  for (const city of KNOWN_CITIES) {
    if (city.aliases.test(text)) {
      hits.push(city.name);
    }
  }
  return hits;
}

function extractYearsAndIsoDates(text: string): { years: number[]; isoDates: string[] } {
  const years = new Set<number>();
  const yearRegex = /\b(20[0-3]\d)\b/g;
  let m: RegExpExecArray | null;
  while ((m = yearRegex.exec(text)) !== null) {
    years.add(Number(m[1]));
  }
  const isoDates: string[] = [];
  const isoRegex = /\b(20\d{2}[-/]\d{2}[-/]\d{2})\b/g;
  while ((m = isoRegex.exec(text)) !== null) {
    isoDates.push(m[1].replace(/\//g, '-'));
  }
  return { years: Array.from(years), isoDates };
}

function parsePdfDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/D:(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const y = raw.match(/(20\d{2})/);
  return y ? y[1] : null;
}

export function runDeterministicCrossModalEngine(input: {
  caseTitle: string;
  captionText: string;
  evidenceRows: EvidenceRowSnapshot[];
}): DeterministicForensicResult {
  const images = input.evidenceRows.filter((e) => e.modality === 'image');
  const videos = input.evidenceRows.filter((e) => e.modality === 'video');
  const audios = input.evidenceRows.filter((e) => e.modality === 'audio');
  const documents = input.evidenceRows.filter((e) => e.modality === 'document');
  const texts = input.evidenceRows.filter((e) => e.modality === 'text');

  const combinedClaimText = sanitizeText(
    [
      input.captionText,
      ...documents.map((d) => d.transcript ?? ''),
      ...texts.map((t) => t.transcript ?? ''),
    ]
      .filter(Boolean)
      .join('\n'),
    5000,
  );

  const manipulationIndicators: ManipulationIndicatorItem[] = [];
  const findings: CrossModalFindingDraft[] = [];
  const graphNodes: CrossModalGraphNodeDraft[] = [];
  const graphEdges: CrossModalGraphEdgeDraft[] = [];

  for (const ev of input.evidenceRows) {
    graphNodes.push({
      nodeKey: `ev_${ev.id.slice(0, 8)}`,
      label: `${ev.originalFilename.slice(0, 26)} (${ev.modality})`,
      nodeType: 'evidence',
      modality: ev.modality,
      details: `SHA-256 ${ev.sha256.slice(0, 14)}...`,
    });
  }

  if (input.captionText.trim()) {
    graphNodes.push({
      nodeKey: 'claim_caption',
      label: 'Submitted Claim / Caption',
      nodeType: 'claim',
      modality: 'text',
      details: sanitizeText(input.captionText, 280),
    });
  }

  // --- 1. Image manipulation & metadata indicators ---
  let imageRiskPoints = 0;
  for (const img of images) {
    const m = safeParseJson<ParsedImageMetrics>(img.metricsJson, {});
    const exif = safeParseJson<ParsedExif>(img.exifJson, {});
    const regions = Array.isArray(m.suspiciousRegions) ? m.suspiciousRegions : [];

    if ((m.blockVarianceRatio ?? 1) >= 2.1 || regions.length > 0) {
      imageRiskPoints += (m.blockVarianceRatio ?? 1) >= 2.4 ? 22 : 12;
      const topReg = regions[0];
      const sectorText = topReg?.sector ?? m.hotspotSector ?? 'Localized region';
      const sev: 'Low' | 'Medium' | 'High' =
        (m.blockVarianceRatio ?? 1) >= 2.4 || topReg?.severity === 'High' ? 'High' : 'Medium';

      manipulationIndicators.push({
        id: `ind-ela-${img.id.slice(0, 8)}`,
        category: 'image_region',
        severity: sev,
        whatDetected: 'Localized Error Level Analysis (ELA) compression residual spike',
        whereDetected: `${img.originalFilename} (Image)`,
        timestampOrRegion: `${sectorText}${topReg ? ` (${topReg.ratioToMedian}x median)` : ''}`,
        whyFlagged: `Peak sector compression error (${m.elaMax ?? topReg?.meanError ?? 'elevated'}) diverges from surrounding frame baseline (${m.blockVarianceRatio ?? 'n/a'}x variance ratio).`,
        supportingEvidence: `ELA mean=${m.elaMean ?? 'n/a'}, P95=${m.elaP95 ?? 'n/a'}, Max=${m.elaMax ?? 'n/a'}, Peak=${sectorText}.`,
        innocentExplanation:
          'Selective brightness/contrast adjustment, high-frequency natural foliage/signage textures, or platform re-encoding can produce elevated ELA residuals.',
      });

      findings.push({
        evidenceId: img.id,
        modality: 'image',
        indicator: 'Localized ELA Compression Differential',
        whyFlagged: `Sector variance ratio ${m.blockVarianceRatio ?? 'n/a'}x centered in ${sectorText} (ELA max ${m.elaMax ?? 'n/a'}).`,
        locationOrTimestamp: `Region: ${sectorText}`,
        confidenceRange: sev === 'High' ? '64% - 82%' : '45% - 68%',
        limitation:
          'ELA detects quantization mismatch, not direct semantic intent; sharp text overlays or localized sharpening can trigger similar residuals.',
        severity: sev,
      });
    }

    if ((m.fftPeriodicPeakScore ?? 0) >= 42) {
      imageRiskPoints += 14;
      manipulationIndicators.push({
        id: `ind-fft-${img.id.slice(0, 8)}`,
        category: 'image_region',
        severity: 'Medium',
        whatDetected: 'Orthogonal 2D FFT spectral periodicity',
        whereDetected: `${img.originalFilename} (2D Frequency Spectrum)`,
        timestampOrRegion: `Global spectrum (Peak index ${m.fftPeriodicPeakScore}%)`,
        whyFlagged: `Elevated periodic energy along orthogonal frequency axes (${m.fftPeriodicPeakScore}%) with high/low radial ratio ${m.fftHighFreqRatio ?? 'n/a'}.`,
        supportingEvidence: `2D DFT peak score ${m.fftPeriodicPeakScore}%, dHash ${img.perceptualHash ?? 'n/a'}.`,
        innocentExplanation:
          'Bilinear/bicubic web thumbnail resizing, JPEG block grid alignment, or camera demosaicing can introduce orthogonal spectral peaks.',
      });
    }

    if (exif.software && /(photoshop|gimp|lightroom|snapseed|picsart|canva|midjourney|stable diffusion|comfyui|firefly|flux)/i.test(exif.software)) {
      imageRiskPoints += 15;
      manipulationIndicators.push({
        id: `ind-soft-${img.id.slice(0, 8)}`,
        category: 'metadata',
        severity: 'Medium',
        whatDetected: `Editing or synthesis software tag (${exif.software})`,
        whereDetected: `${img.originalFilename} (EXIF IFD0 Software)`,
        timestampOrRegion: 'EXIF Header Metadata',
        whyFlagged: `File header explicitly retains post-capture editing/generation software marker "${exif.software}".`,
        supportingEvidence: `Camera: ${[exif.make, exif.model].filter(Boolean).join(' ') || 'Unspecified'}, Date: ${exif.dateTimeOriginal ?? 'n/a'}.`,
        innocentExplanation:
          'Routine photojournalism exposure correction, cropping, or color calibration in standard editors.',
      });
    } else if (!exif.hasExif) {
      manipulationIndicators.push({
        id: `ind-noexif-${img.id.slice(0, 8)}`,
        category: 'metadata',
        severity: 'Low',
        whatDetected: 'Camera EXIF / GPS header absent',
        whereDetected: `${img.originalFilename} (Header)`,
        timestampOrRegion: 'Container Metadata Header',
        whyFlagged: 'No hardware camera make, model, timestamp, or GPS EXIF blocks are present.',
        supportingEvidence: `EXIF keys present: 0; dimensions ${m.width ?? '?'}x${m.height ?? '?'}.`,
        innocentExplanation:
          'Social platforms (WhatsApp, X, Instagram, Telegram) strip EXIF metadata automatically during upload.',
      });
    }
  }

  // --- 2. Video frame anomalies & metadata ---
  let videoRiskPoints = 0;
  for (const vid of videos) {
    const vm = safeParseJson<ParsedVideoMetrics>(vid.metricsJson, {});
    const frames = safeParseJson<
      Array<{ timestampSec: number; deltaScore: number; suspicious: boolean }>
    >(vid.framesJson, []);
    const flagged = frames.filter((f) => f.suspicious);

    if (flagged.length > 0) {
      videoRiskPoints += Math.min(25, flagged.length * 8);
      const tsLabel = flagged.map((f) => `${f.timestampSec}s (Δ${f.deltaScore})`).join(', ');
      manipulationIndicators.push({
        id: `ind-vid-${vid.id.slice(0, 8)}`,
        category: 'video_frame',
        severity: flagged.length >= 2 || (vm.maxFrameDelta ?? 0) >= 40 ? 'High' : 'Medium',
        whatDetected: `${flagged.length} temporal frame-to-frame luminance discontinuity jump(s)`,
        whereDetected: `${vid.originalFilename} (Video Stream)`,
        timestampOrRegion: tsLabel,
        whyFlagged: `Frame luminance difference peaked at Δ${vm.maxFrameDelta ?? 'n/a'}, exceeding the clip adaptive motion threshold.`,
        supportingEvidence: `Sampled ${frames.length} keyframes across ${vm.durationSec ?? '?'}s (${vm.width ?? '?'}x${vm.height ?? '?'}).`,
        innocentExplanation:
          'Intentional editorial jump-cuts, rapid camera panning, strobe lighting, or scene changes explain high inter-frame deltas without tampering.',
      });

      findings.push({
        evidenceId: vid.id,
        modality: 'video',
        indicator: 'Video Temporal Keyframe Discontinuity',
        whyFlagged: `Flagged ${flagged.length} keyframe delta spikes (max Δ${vm.maxFrameDelta ?? 0}).`,
        locationOrTimestamp: tsLabel,
        confidenceRange: '52% - 76%',
        limitation: '8-frame uniform sampling can coincide with legitimate scene cuts or camera flashes.',
        severity: flagged.length >= 2 ? 'High' : 'Medium',
      });
    }

    if (vm.hasAudioTrack === false) {
      manipulationIndicators.push({
        id: `ind-vid-silent-${vid.id.slice(0, 8)}`,
        category: 'metadata',
        severity: 'Low',
        whatDetected: 'Silent video container (no audio track)',
        whereDetected: `${vid.originalFilename} (${vm.containerFormat?.toUpperCase() ?? 'Video'} Header)`,
        timestampOrRegion: 'Container Track Table',
        whyFlagged: 'Video container lacks an embedded audio stream, preventing lip-sync or ambient acoustics verification.',
        supportingEvidence: `hasAudioTrack=false, duration=${vm.durationSec ?? '?'}s.`,
        innocentExplanation: 'Muted screen recordings, CCTV exports, or GIF-to-MP4 conversions naturally contain no audio track.',
      });
    }
  }

  // --- 3. Audio discontinuities & synthetic speech markers ---
  let audioRiskPoints = 0;
  for (const aud of audios) {
    const am = safeParseJson<ParsedAudioMetrics>(aud.metricsJson, {});
    const windows = Array.isArray(am.discontinuityWindows) ? am.discontinuityWindows : [];
    const synthMarkers = Array.isArray(am.syntheticSpeechIndicators)
      ? am.syntheticSpeechIndicators
      : [];

    if (windows.length > 0) {
      audioRiskPoints += Math.min(25, windows.length * 12);
      const winText = windows
        .map((w) => `${w.startSec.toFixed(2)}s-${w.endSec.toFixed(2)}s (Δ${w.deltaDb}dB)`)
        .join(', ');
      manipulationIndicators.push({
        id: `ind-aud-${aud.id.slice(0, 8)}`,
        category: 'audio_discontinuity',
        severity: windows.length >= 2 || windows[0].deltaDb >= 8 ? 'High' : 'Medium',
        whatDetected: `${windows.length} abrupt acoustic amplitude / noise-floor discontinuity window(s)`,
        whereDetected: `${aud.originalFilename} (Audio Waveform)`,
        timestampOrRegion: winText,
        whyFlagged: windows[0].note,
        supportingEvidence: `Sample rate ${am.sampleRate ?? '?'}Hz, energy variance ${am.segmentEnergyVariance ?? '?'} dB², RMS ${am.rmsDb ?? '?'} dB.`,
        innocentExplanation:
          'Cellular packet-loss concealment, Bluetooth headset noise-gating, or microphone wind gusts can induce transient amplitude shifts.',
      });

      findings.push({
        evidenceId: aud.id,
        modality: 'audio',
        indicator: 'Acoustic Noise-Floor / Amplitude Splice Window',
        whyFlagged: `${windows.length} segment(s) showed abrupt RMS/ZCR transition (${winText}).`,
        locationOrTimestamp: winText,
        confidenceRange: '58% - 79%',
        limitation: 'PCM energy jumps alone cannot differentiate audio splicing from aggressive mobile noise suppression.',
        severity: 'High',
      });
    } else if (synthMarkers.some((s) => /vocoder|flat|low codec|narrowband/i.test(s))) {
      audioRiskPoints += 10;
      manipulationIndicators.push({
        id: `ind-aud-syn-${aud.id.slice(0, 8)}`,
        category: 'audio_discontinuity',
        severity: 'Medium',
        whatDetected: 'Synthetic-speech or narrowband codec heuristic marker',
        whereDetected: `${aud.originalFilename} (Audio Signal)`,
        timestampOrRegion: `0.00s - ${am.durationSec ?? '?'}s`,
        whyFlagged: synthMarkers[0],
        supportingEvidence: `Sample rate=${am.sampleRate ?? '?'}Hz, bitrate=${am.bitrateKbps ?? '?'}kbps.`,
        innocentExplanation: 'Voice notes compressed via messaging apps (WhatsApp/Telegram Opus/AAC) often operate at 16–24 kHz.',
      });
    }
  }

  // --- 4. Document integrity indicators ---
  let docRiskPoints = 0;
  for (const doc of documents) {
    const dm = safeParseJson<ParsedDocMetrics>(doc.metricsJson, {});
    if (dm.hasEmbeddedScripts) {
      docRiskPoints += 25;
      manipulationIndicators.push({
        id: `ind-doc-js-${doc.id.slice(0, 8)}`,
        category: 'metadata',
        severity: 'High',
        whatDetected: 'Active embedded PDF JavaScript / Launch action',
        whereDetected: `${doc.originalFilename} (PDF Catalog)`,
        timestampOrRegion: 'PDF Structural Trailer',
        whyFlagged: 'Document contains /JavaScript, /OpenAction, or /Launch tags.',
        supportingEvidence: `PDF v${dm.pdfVersion ?? '?'}, Creator: ${dm.creator ?? 'n/a'}.`,
        innocentExplanation: 'Interactive official tax or enterprise forms occasionally embed JavaScript validation scripts.',
      });
    }
    if ((dm.incrementalUpdatesCount ?? 0) > 0) {
      docRiskPoints += 10;
      manipulationIndicators.push({
        id: `ind-doc-eof-${doc.id.slice(0, 8)}`,
        category: 'metadata',
        severity: 'Medium',
        whatDetected: `${dm.incrementalUpdatesCount} incremental PDF revision append(s)`,
        whereDetected: `${doc.originalFilename} (EOF Markers)`,
        timestampOrRegion: `PDF Structural Revisions (${dm.incrementalUpdatesCount}x %%EOF)`,
        whyFlagged: 'Multiple %%EOF trailers indicate the document was re-saved or modified after initial creation.',
        supportingEvidence: `CreationDate=${dm.creationDate ?? 'n/a'}, ModDate=${dm.modDate ?? 'n/a'}, Producer=${dm.producer ?? 'n/a'}.`,
        innocentExplanation: 'Applying an electronic signature, filling form fields, or adding redaction annotations creates incremental saves.',
      });
    }
  }

  // --- 5. Text / Metadata Cross-Checks (Location & Date) ---
  const claimedCities = extractClaimedCities(combinedClaimText);
  const { years: claimedYears, isoDates: claimedIsoDates } = extractYearsAndIsoDates(combinedClaimText);

  const imageGpsEntries = images
    .map((img) => ({ img, exif: safeParseJson<ParsedExif>(img.exifJson, {}) }))
    .filter((x) => typeof x.exif.gpsLatitude === 'number' && typeof x.exif.gpsLongitude === 'number');

  const exifDateEntries = images
    .map((img) => ({ img, date: safeParseJson<ParsedExif>(img.exifJson, {}).dateTimeOriginal ?? null }))
    .filter((x): x is { img: EvidenceRowSnapshot; date: string } => Boolean(x.date));

  const videoDateEntries = videos
    .map((vid) => ({ vid, date: safeParseJson<ParsedVideoMetrics>(vid.metricsJson, {}).creationTimestamp ?? null }))
    .filter((x): x is { vid: EvidenceRowSnapshot; date: string } => Boolean(x.date));

  const docDateEntries = documents
    .map((doc) => {
      const dm = safeParseJson<ParsedDocMetrics>(doc.metricsJson, {});
      return { doc, creation: parsePdfDate(dm.creationDate), mod: parsePdfDate(dm.modDate) };
    })
    .filter((x) => Boolean(x.creation || x.mod));

  // Build 6 Cross-Modal Correlations cleanly without ever fabricating missing pairs
  const correlations: CrossModalCorrelationItem[] = [];
  let crossModalRiskPoints = 0;

  // Pair 1: Image vs Video
  if (images.length > 0 && videos.length > 0) {
    const imgExifDates = exifDateEntries.map((x) => x.date.slice(0, 10));
    const vidDates = videoDateEntries.map((x) => x.date.slice(0, 10));
    const sup: string[] = [
      `Both visual modalities are present (${images.length} image, ${videos.length} video) for side-by-side scene & lighting comparison.`,
    ];
    const con: string[] = [];
    if (imgExifDates.length > 0 && vidDates.length > 0) {
      const overlap = imgExifDates.some((d) => vidDates.includes(d));
      if (overlap) {
        sup.push(`Image EXIF capture date matches video container creation date (${imgExifDates[0]}).`);
      } else {
        con.push(`Image EXIF date (${imgExifDates[0]}) differs from video container timestamp (${vidDates[0]}).`);
        crossModalRiskPoints += 12;
      }
    }
    correlations.push({
      id: 'corr-img-vid',
      pairKey: 'image_vs_video',
      pairLabel: 'Image ↔ Video Visual & Temporal Consistency',
      status: con.length > 0 ? 'contradictory' : 'inconclusive',
      supportingSignals: sup,
      contradictorySignals: con,
      relatedEvidence: [...images, ...videos].map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: con.length > 0 ? '60% - 78%' : '40% - 62%',
      uncertaintyNote:
        'Automated pixel-level alignment across still images and compressed video streams requires visual scene matching by an investigator or Gemini Vision.',
      alternativeExplanations: [
        'Still photo and video clip may have been captured on separate devices with different clock settings.',
      ],
    });
  } else {
    correlations.push({
      id: 'corr-img-vid',
      pairKey: 'image_vs_video',
      pairLabel: 'Image ↔ Video Visual & Temporal Consistency',
      status: 'insufficient_evidence',
      supportingSignals: [],
      contradictorySignals: [],
      relatedEvidence: [...images, ...videos].map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: 'N/A',
      uncertaintyNote:
        images.length === 0 && videos.length === 0
          ? 'Neither still image nor video evidence uploaded yet.'
          : 'Requires both image and video artifacts in the case bundle to compare across modalities.',
      alternativeExplanations: [],
    });
  }

  // Pair 2: Video vs Audio
  if (videos.length > 0 && audios.length > 0) {
    const vidMetricsList = videos.map((v) => ({
      v,
      m: safeParseJson<ParsedVideoMetrics>(v.metricsJson, {}),
    }));
    const audMetricsList = audios.map((a) => ({
      a,
      m: safeParseJson<ParsedAudioMetrics>(a.metricsJson, {}),
    }));
    const sup: string[] = [];
    const con: string[] = [];

    const firstVid = vidMetricsList[0].m;
    const firstAud = audMetricsList[0].m;
    if (firstVid.durationSec && firstAud.durationSec) {
      const diff = Math.abs(firstVid.durationSec - firstAud.durationSec);
      if (diff <= 1.5) {
        sup.push(
          `Video duration (${firstVid.durationSec}s) closely matches separate audio track duration (${firstAud.durationSec}s).`,
        );
      } else {
        con.push(
          `Video length (${firstVid.durationSec}s) diverges by ${diff.toFixed(1)}s from attached audio clip (${firstAud.durationSec}s).`,
        );
        crossModalRiskPoints += 10;
      }
    }
    if (firstVid.hasAudioTrack === false) {
      con.push('Video container has no embedded audio track while external audio clip is supplied.');
    }

    correlations.push({
      id: 'corr-vid-aud',
      pairKey: 'video_vs_audio',
      pairLabel: 'Video ↔ Audio Synchronization & Continuity',
      status: con.length > 0 ? 'contradictory' : sup.length > 0 ? 'supporting' : 'inconclusive',
      supportingSignals: sup.length > 0 ? sup : ['Both video and audio files loaded in case inventory.'],
      contradictorySignals: con,
      relatedEvidence: [...videos, ...audios].map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: con.length > 0 ? '58% - 76%' : '48% - 68%',
      uncertaintyNote:
        'Duration alignment and container track flags do not verify phoneme-to-lip synchronization.',
      alternativeExplanations: [
        'External witness voice memo may be commentary recorded separately from silent CCTV or street video.',
      ],
    });
  } else if (videos.length > 0) {
    const firstVid = safeParseJson<ParsedVideoMetrics>(videos[0].metricsJson, {});
    correlations.push({
      id: 'corr-vid-aud',
      pairKey: 'video_vs_audio',
      pairLabel: 'Video ↔ Audio Synchronization & Continuity',
      status: firstVid.hasAudioTrack === false ? 'inconclusive' : 'supporting',
      supportingSignals:
        firstVid.hasAudioTrack === true
          ? [`Embedded audio track detected inside ${videos[0].originalFilename} (${firstVid.durationSec ?? '?'}s).`]
          : [],
      contradictorySignals:
        firstVid.hasAudioTrack === false
          ? ['Video container has no embedded audio stream for internal A/V sync verification.']
          : [],
      relatedEvidence: videos.map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: '45% - 65%',
      uncertaintyNote: 'No separate audio file uploaded; assessment reflects internal video container track header only.',
      alternativeExplanations: ['Many security cameras and social GIF loops omit audio streams by default.'],
    });
  } else {
    correlations.push({
      id: 'corr-vid-aud',
      pairKey: 'video_vs_audio',
      pairLabel: 'Video ↔ Audio Synchronization & Continuity',
      status: 'insufficient_evidence',
      supportingSignals: [],
      contradictorySignals: [],
      relatedEvidence: audios.map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: 'N/A',
      uncertaintyNote: 'Requires video evidence alongside audio to evaluate A/V track alignment.',
      alternativeExplanations: [],
    });
  }

  // Pair 3: Audio vs Transcript / Claim
  if (audios.length > 0 && combinedClaimText.length > 0) {
    const aud = audios[0];
    const am = safeParseJson<ParsedAudioMetrics>(aud.metricsJson, {});
    const windows = Array.isArray(am.discontinuityWindows) ? am.discontinuityWindows : [];
    const con: string[] = [];
    const sup: string[] = [];

    if (windows.length > 0) {
      con.push(
        `Claimed witness audio (${aud.originalFilename}) exhibits ${windows.length} abrupt spectral/amplitude splice window(s) (${windows.map((w) => `${w.startSec}s-${w.endSec}s`).join(', ')}).`,
      );
      crossModalRiskPoints += 14;
    } else {
      sup.push(`No abrupt RMS amplitude discontinuity detected in ${aud.originalFilename} (${am.durationSec ?? '?'}s).`);
    }
    if (aud.transcript) {
      sup.push('Audio transcript excerpt is stored and available for semantic cross-check against submitted claim text.');
    }

    correlations.push({
      id: 'corr-aud-txt',
      pairKey: 'audio_vs_transcript',
      pairLabel: 'Audio ↔ Transcript / Claim Alignment',
      status: con.length > 0 ? 'contradictory' : 'supporting',
      supportingSignals: sup,
      contradictorySignals: con,
      relatedEvidence: [...audios, ...texts, ...documents].map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: con.length > 0 ? '58% - 78%' : '52% - 72%',
      uncertaintyNote:
        'Automated speech transcription requires Gemini multimodal audio analysis or manual human listening.',
      alternativeExplanations: [
        'Mobile call noise cancellation or Bluetooth hands-free dropouts can resemble mid-clip splicing.',
      ],
    });
  } else {
    correlations.push({
      id: 'corr-aud-txt',
      pairKey: 'audio_vs_transcript',
      pairLabel: 'Audio ↔ Transcript / Claim Alignment',
      status: 'insufficient_evidence',
      supportingSignals: [],
      contradictorySignals: [],
      relatedEvidence: [...audios, ...texts].map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: 'N/A',
      uncertaintyNote: 'Requires both an audio recording and caption/transcript text to cross-check.',
      alternativeExplanations: [],
    });
  }

  // Pair 4: Caption vs Visual Evidence
  if ((images.length > 0 || videos.length > 0) && combinedClaimText.length > 0) {
    const sup: string[] = [];
    const con: string[] = [];
    for (const img of images) {
      const m = safeParseJson<ParsedImageMetrics>(img.metricsJson, {});
      if ((m.blockVarianceRatio ?? 1) >= 2.2) {
        con.push(
          `${img.originalFilename} shows localized ELA compression anomaly (${m.blockVarianceRatio}x in ${m.hotspotSector ?? 'hotspot'}), weakening unedited visual claim certainty.`,
        );
      } else {
        sup.push(`${img.originalFilename} shows uniform baseline ELA compression profile.`);
      }
    }
    for (const vid of videos) {
      const vm = safeParseJson<ParsedVideoMetrics>(vid.metricsJson, {});
      if ((vm.suspiciousCount ?? 0) > 0) {
        con.push(
          `${vid.originalFilename} contains ${vm.suspiciousCount} flagged keyframe delta jump(s) at ${(vm.flaggedTimestamps ?? []).map((t) => `${t}s`).join(', ')}.`,
        );
      } else if ((vm.frameCount ?? 0) > 0) {
        sup.push(`${vid.originalFilename} keyframes show smooth temporal continuity.`);
      }
    }

    correlations.push({
      id: 'corr-cap-vis',
      pairKey: 'caption_vs_visual',
      pairLabel: 'Caption / Claim ↔ Visual Evidence Integrity',
      status: con.length > 0 ? 'contradictory' : sup.length > 0 ? 'supporting' : 'inconclusive',
      supportingSignals: sup,
      contradictorySignals: con,
      relatedEvidence: [...images, ...videos, ...texts].map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: con.length > 0 ? '60% - 80%' : '50% - 70%',
      uncertaintyNote:
        'Heuristic signal analysis verifies pixel/frame integrity; full scene object recognition uses Gemini Vision when enabled.',
      alternativeExplanations: [
        'Social-media upload compression or valid color grading can elevate ELA metrics on authentic photos.',
      ],
    });
  } else {
    correlations.push({
      id: 'corr-cap-vis',
      pairKey: 'caption_vs_visual',
      pairLabel: 'Caption / Claim ↔ Visual Evidence Integrity',
      status: 'insufficient_evidence',
      supportingSignals: [],
      contradictorySignals: [],
      relatedEvidence: [...images, ...videos].map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: 'N/A',
      uncertaintyNote: 'Upload visual media and provide caption/claim text to inspect alignment.',
      alternativeExplanations: [],
    });
  }

  // Pair 5: Claimed Date vs Metadata
  const hasAnyDateMeta = exifDateEntries.length > 0 || videoDateEntries.length > 0 || docDateEntries.length > 0;
  if (hasAnyDateMeta && (claimedYears.length > 0 || claimedIsoDates.length > 0)) {
    const sup: string[] = [];
    const con: string[] = [];

    for (const entry of exifDateEntries) {
      const exifYear = Number(entry.date.slice(0, 4));
      if (Number.isFinite(exifYear) && claimedYears.length > 0) {
        if (!claimedYears.includes(exifYear)) {
          const msg = `Image EXIF DateTimeOriginal (${entry.date.slice(0, 10)}) in ${entry.img.originalFilename} contradicts claimed year (${claimedYears.join('/')}) in caption/documents.`;
          con.push(msg);
          crossModalRiskPoints += 22;
          manipulationIndicators.push({
            id: `ind-date-${entry.img.id.slice(0, 8)}`,
            category: 'text_context',
            severity: 'High',
            whatDetected: 'Claimed timeline vs. embedded EXIF capture date contradiction',
            whereDetected: `${entry.img.originalFilename} vs. Submitted Claim Text`,
            timestampOrRegion: `EXIF ${entry.date.slice(0, 10)} vs. Claimed ${claimedYears.join('/')}`,
            whyFlagged: msg,
            supportingEvidence: `Parsed EXIF DateTimeOriginal: ${entry.date}; claimed text references year(s): ${claimedYears.join(', ')}.`,
            innocentExplanation: 'An archived photograph may have been reused by mistake alongside a recent text update, or the camera clock was misconfigured.',
          });
          findings.push({
            evidenceId: entry.img.id,
            modality: 'text',
            indicator: 'Date Metadata vs. Claimed Timeline Mismatch',
            whyFlagged: msg,
            locationOrTimestamp: `EXIF DateTimeOriginal: ${entry.date}`,
            confidenceRange: '74% - 91%',
            limitation: 'Camera clock drift or inherited EXIF headers from templates can create false date conflicts.',
            severity: 'High',
          });
          if (input.captionText.trim()) {
            graphNodes.push({
              nodeKey: `meta_date_${entry.img.id.slice(0, 6)}`,
              label: `EXIF Date: ${entry.date.slice(0, 10)}`,
              nodeType: 'metadata',
              modality: 'image',
              details: `DateTimeOriginal=${entry.date}`,
            });
            graphEdges.push({
              sourceKey: `meta_date_${entry.img.id.slice(0, 6)}`,
              targetKey: 'claim_caption',
              relation: 'contradicts',
              label: 'Timeline Mismatch',
              explanation: msg,
              confidenceRange: '74% - 91%',
              limitation: 'Camera clock misconfiguration cannot be excluded without independent corroboration.',
            });
          }
        } else {
          sup.push(`EXIF DateTimeOriginal (${entry.date.slice(0, 10)}) aligns with claimed year ${exifYear}.`);
        }
      }
    }

    for (const entry of videoDateEntries) {
      const vYear = Number(entry.date.slice(0, 4));
      if (Number.isFinite(vYear) && claimedYears.length > 0 && !claimedYears.includes(vYear)) {
        con.push(`Video mvhd creationTimestamp (${entry.date.slice(0, 10)}) in ${entry.vid.originalFilename} conflicts with claimed year ${claimedYears.join('/')}.`);
        crossModalRiskPoints += 16;
      }
    }

    correlations.push({
      id: 'corr-date-meta',
      pairKey: 'date_vs_metadata',
      pairLabel: 'Claimed Date ↔ Embedded File Timestamps',
      status: con.length > 0 ? 'contradictory' : sup.length > 0 ? 'supporting' : 'inconclusive',
      supportingSignals: sup,
      contradictorySignals: con,
      relatedEvidence: [...exifDateEntries.map((x) => x.img), ...videoDateEntries.map((x) => x.vid), ...documents].map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: con.length > 0 ? '74% - 91%' : '62% - 82%',
      uncertaintyNote: 'File timestamps can be stripped by social platforms or shifted by camera timezone settings.',
      alternativeExplanations: [
        'Incorrect camera RTC battery/clock settings or file re-export timestamps.',
      ],
    });
  } else {
    correlations.push({
      id: 'corr-date-meta',
      pairKey: 'date_vs_metadata',
      pairLabel: 'Claimed Date ↔ Embedded File Timestamps',
      status: 'insufficient_evidence',
      supportingSignals: [],
      contradictorySignals: [],
      relatedEvidence: input.evidenceRows.slice(0, 4).map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: 'N/A',
      uncertaintyNote: !hasAnyDateMeta
        ? 'No embedded capture timestamp found in uploaded EXIF/container headers.'
        : 'No explicit year or date claim detected in submitted caption/text.',
      alternativeExplanations: [],
    });
  }

  // Pair 6: Claimed Location vs Context (EXIF GPS / Visual-Text cues)
  if (imageGpsEntries.length > 0 && claimedCities.length > 0) {
    const sup: string[] = [];
    const con: string[] = [];

    for (const entry of imageGpsEntries) {
      const lat = entry.exif.gpsLatitude!;
      const lon = entry.exif.gpsLongitude!;
      const resolvedCity = resolveCityFromGps(lat, lon);

      if (resolvedCity && !claimedCities.includes(resolvedCity)) {
        const msg = `EXIF GPS (${lat}°, ${lon}° → ${resolvedCity}) in ${entry.img.originalFilename} contradicts claimed location (${claimedCities.join(', ')}).`;
        con.push(msg);
        crossModalRiskPoints += 24;
        manipulationIndicators.push({
          id: `ind-loc-${entry.img.id.slice(0, 8)}`,
          category: 'text_context',
          severity: 'High',
          whatDetected: `GPS geolocation (${resolvedCity}) vs. claimed location (${claimedCities.join('/')}) contradiction`,
          whereDetected: `${entry.img.originalFilename} (EXIF GPS) vs. Caption Context`,
          timestampOrRegion: `GPS ${lat}°, ${lon}° vs. "${claimedCities.join(', ')}"`,
          whyFlagged: msg,
          supportingEvidence: `Embedded EXIF GPS tags map inside ${resolvedCity} bounding coordinates; text context asserts ${claimedCities.join(', ')}.`,
          innocentExplanation: 'Caption may reference an adjacent news report while mistakenly attaching an older photo from another city, or GPS metadata was spoofing/cached.',
        });
        findings.push({
          evidenceId: entry.img.id,
          modality: 'text',
          indicator: 'Geolocation EXIF vs. Claimed Location Contradiction',
          whyFlagged: msg,
          locationOrTimestamp: `EXIF GPS ${lat}°, ${lon}°`,
          confidenceRange: '78% - 92%',
          limitation: 'GPS tags can be injected, inherited, or cached from prior device fixes.',
          severity: 'High',
        });
        if (input.captionText.trim()) {
          graphNodes.push({
            nodeKey: `meta_gps_${entry.img.id.slice(0, 6)}`,
            label: `EXIF GPS: ${resolvedCity}`,
            nodeType: 'metadata',
            modality: 'image',
            details: `${lat}°, ${lon}°`,
          });
          graphEdges.push({
            sourceKey: `meta_gps_${entry.img.id.slice(0, 6)}`,
            targetKey: 'claim_caption',
            relation: 'contradicts',
            label: 'GPS Location Conflict',
            explanation: msg,
            confidenceRange: '78% - 92%',
            limitation: 'GPS EXIF fields are editable and do not prove device provenance alone.',
          });
        }
      } else if (resolvedCity && claimedCities.includes(resolvedCity)) {
        sup.push(`EXIF GPS (${lat}°, ${lon}° → ${resolvedCity}) corroborates claimed location "${resolvedCity}".`);
        if (input.captionText.trim()) {
          graphNodes.push({
            nodeKey: `meta_gps_${entry.img.id.slice(0, 6)}`,
            label: `EXIF GPS: ${resolvedCity}`,
            nodeType: 'metadata',
            modality: 'image',
            details: `${lat}°, ${lon}°`,
          });
          graphEdges.push({
            sourceKey: `meta_gps_${entry.img.id.slice(0, 6)}`,
            targetKey: 'claim_caption',
            relation: 'corroborates',
            label: 'GPS Location Match',
            explanation: `EXIF GPS maps to ${resolvedCity}, consistent with claim text.`,
            confidenceRange: '72% - 88%',
            limitation: 'GPS EXIF tags can be modified prior to upload.',
          });
        }
      } else {
        sup.push(`EXIF GPS (${lat}°, ${lon}°) present; outside local city lookup table — verify on map against "${claimedCities.join(', ')}".`);
      }
    }

    correlations.push({
      id: 'corr-loc-ctx',
      pairKey: 'location_vs_context',
      pairLabel: 'Claimed Location ↔ Geolocation & Contextual Clues',
      status: con.length > 0 ? 'contradictory' : sup.length > 0 ? 'supporting' : 'inconclusive',
      supportingSignals: sup,
      contradictorySignals: con,
      relatedEvidence: imageGpsEntries.map((x) => ({
        id: x.img.id,
        filename: x.img.originalFilename,
        modality: x.img.modality,
      })),
      confidenceRange: con.length > 0 ? '76% - 92%' : '54% - 76%',
      uncertaintyNote: 'Coordinate verification relies on embedded EXIF GPS headers when present.',
      alternativeExplanations: ['GPS spoofing, VPN/A-GPS stale fix, or accidental archive image attachment.'],
    });
  } else {
    correlations.push({
      id: 'corr-loc-ctx',
      pairKey: 'location_vs_context',
      pairLabel: 'Claimed Location ↔ Geolocation & Contextual Clues',
      status: 'insufficient_evidence',
      supportingSignals: [],
      contradictorySignals: [],
      relatedEvidence: images.map((e) => ({
        id: e.id,
        filename: e.originalFilename,
        modality: e.modality,
      })),
      confidenceRange: 'N/A',
      uncertaintyNote:
        imageGpsEntries.length === 0
          ? 'No embedded GPS coordinates found in media EXIF headers.'
          : 'No recognized city or location anchor found in caption/document text.',
      alternativeExplanations: [],
    });
  }

  // Ensure every evidence item has a baseline edge to claim if caption exists and no edge attached yet
  if (input.captionText.trim()) {
    for (const ev of input.evidenceRows) {
      const nodeKey = `ev_${ev.id.slice(0, 8)}`;
      const alreadyLinked = graphEdges.some((e) => e.sourceKey === nodeKey || e.targetKey === nodeKey);
      if (!alreadyLinked) {
        graphEdges.push({
          sourceKey: nodeKey,
          targetKey: 'claim_caption',
          relation: 'inconclusive',
          label: 'Case Bundle Link',
          explanation: `Uploaded ${ev.modality} (${ev.originalFilename}) belongs to this case bundle alongside the caption claim.`,
          confidenceRange: '40% - 60%',
          limitation: 'Requires cross-modal corroboration or AI scene review to confirm semantic alignment.',
        });
      }
    }
  }

  // Aggregate calibrated risk level and confidence interval
  const totalRiskPoints =
    imageRiskPoints + videoRiskPoints + audioRiskPoints + docRiskPoints + crossModalRiskPoints;
  const riskLevel: 'Low' | 'Medium' | 'High' =
    totalRiskPoints >= 45 || correlations.some((c) => c.status === 'contradictory' && c.contradictorySignals.length > 0 && crossModalRiskPoints >= 20)
      ? 'High'
      : totalRiskPoints >= 18 || manipulationIndicators.some((m) => m.severity !== 'Low')
        ? 'Medium'
        : 'Low';

  const confidenceMin = Math.max(25, Math.min(82, 28 + Math.round(totalRiskPoints * 0.72)));
  const confidenceMax = Math.max(confidenceMin + 14, Math.min(93, confidenceMin + 18));

  const contradictionCount = correlations.filter((c) => c.status === 'contradictory').length;
  const indicatorCount = manipulationIndicators.length;

  const summary =
    input.evidenceRows.length === 0
      ? 'No evidence files uploaded yet. Ingest image, video, audio, or document files to compute deterministic signals and cross-modal correlations.'
      : `Deterministic forensic pass inspected ${input.evidenceRows.length} evidence item(s) across ${[
          images.length > 0 ? `${images.length} image` : '',
          videos.length > 0 ? `${videos.length} video` : '',
          audios.length > 0 ? `${audios.length} audio` : '',
          documents.length > 0 ? `${documents.length} document` : '',
        ]
          .filter(Boolean)
          .join(', ')}. Recorded ${indicatorCount} structured signal indicator(s) and ${contradictionCount} cross-modal contradiction(s). Findings represent probabilistic indicators rather than definitive proof.`;

  return {
    riskLevel,
    confidenceMin,
    confidenceMax,
    summary,
    correlations,
    manipulationIndicators,
    findings,
    graphNodes,
    graphEdges,
    limitations: [
      'Signal heuristics (ELA, 2D FFT, PCM RMS variance, and header parsing) detect statistical artifacts, not intent.',
      'Messaging-app compression and social-media EXIF stripping frequently alter headers on authentic media.',
      'Cross-modal pairs marked Insufficient Evidence reflect missing source modalities rather than negative findings.',
    ],
    alternativeExplanations: [
      'Routine cropping, contrast adjustment, or re-encoding by messaging apps can explain elevated ELA or stripped EXIF.',
      'Editorial cuts or archival B-roll reuse can explain frame deltas or date discrepancies without malicious intent.',
      'VoIP / Bluetooth noise suppression can introduce brief robotic amplitude shifts in voice recordings.',
    ],
    recommendedChecks: [
      'Request the original unedited camera file (RAW/DNG or original container) to confirm sensor provenance.',
      'Verify physical street signage, landmarks, weather logs, or reverse-image search history independently.',
      'Inspect high-severity manipulation regions and flagged audio/video timestamps manually.',
    ],
  };
}
