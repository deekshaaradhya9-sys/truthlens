import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import exifr from 'exifr';
import { ELA_DIR } from '../db/index.ts';

export interface ImageForensicMetrics {
  width: number;
  height: number;
  elaMean: number;
  elaMax: number;
  elaP95: number;
  blockVarianceRatio: number;
  hotspotSector: string;
  fftHighFreqRatio: number;
  fftPeriodicPeakScore: number;
  perceptualHash: string;
  elaFilename: string;
  fftFilename: string;
  manipulationIndicators: string[];
  aiGenerationIndicators: string[];
  suspiciousRegions: Array<{
    sector: string;
    meanError: number;
    ratioToMedian: number;
    severity: 'Low' | 'Medium' | 'High';
    note: string;
  }>;
  integrityCheck: {
    formatVerified: boolean;
    dimensions: string;
    hasHardwareExif: boolean;
    editingSoftwareTag: string | null;
  };
  exifSummary: {
    make: string | null;
    model: string | null;
    software: string | null;
    dateTimeOriginal: string | null;
    gpsLatitude: number | null;
    gpsLongitude: number | null;
    hasExif: boolean;
    rawTags: Record<string, string | number>;
  };
}

function toHotspotColor(val: number): [number, number, number] {
  // Forensic cyan -> amber -> crimson heatmap scale
  const t = Math.max(0, Math.min(1, val / 255));
  if (t < 0.25) {
    const k = t / 0.25;
    return [Math.round(8 + k * 6), Math.round(14 + k * 90), Math.round(28 + k * 110)];
  }
  if (t < 0.6) {
    const k = (t - 0.25) / 0.35;
    return [Math.round(14 + k * 231), Math.round(104 + k * 54), Math.round(138 - k * 127)];
  }
  const k = (t - 0.6) / 0.4;
  return [Math.round(245 - k * 6), Math.round(158 - k * 90), Math.round(11 + k * 57)];
}

function compute1dDft(re: Float64Array, im: Float64Array, n: number): [Float64Array, Float64Array] {
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sumRe = 0;
    let sumIm = 0;
    const angleBase = (-2 * Math.PI * k) / n;
    for (let t = 0; t < n; t++) {
      const angle = angleBase * t;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      sumRe += re[t] * cos - im[t] * sin;
      sumIm += re[t] * sin + im[t] * cos;
    }
    outRe[k] = sumRe;
    outIm[k] = sumIm;
  }
  return [outRe, outIm];
}

export async function analyzeImageBuffer(buffer: Buffer): Promise<ImageForensicMetrics> {
  // 1. Decode original normalized RGB (cap working resolution for speed while keeping exact ratio)
  const meta = await sharp(buffer).metadata();
  const origWidth = meta.width ?? 800;
  const origHeight = meta.height ?? 600;

  const working = sharp(buffer)
    .rotate()
    .resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true });

  const { data: origRgb, info } = await working
    .clone()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // Re-compress working image at JPEG Q=90 for Error Level Analysis
  const recompressedJpeg = await sharp(origRgb, {
    raw: { width: w, height: h, channels: 3 },
  })
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const { data: recompRgb } = await sharp(recompressedJpeg)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = w * h;
  const diffs = new Float32Array(pixelCount);
  const elaRgba = Buffer.alloc(pixelCount * 3);

  // Grid 4x4 sector accumulator for localized tamper hotspot
  const sectorSums = new Float64Array(16);
  const sectorCounts = new Uint32Array(16);

  let sumDiff = 0;
  let maxDiff = 0;
  const hist = new Uint32Array(256);

  for (let y = 0; y < h; y++) {
    const sy = Math.min(3, Math.floor((y / h) * 4));
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const p = idx * 3;
      const dr = Math.abs(origRgb[p] - recompRgb[p]);
      const dg = Math.abs(origRgb[p + 1] - recompRgb[p + 1]);
      const db = Math.abs(origRgb[p + 2] - recompRgb[p + 2]);
      const meanErr = (dr + dg + db) / 3;
      diffs[idx] = meanErr;
      sumDiff += meanErr;
      if (meanErr > maxDiff) maxDiff = meanErr;

      const amplified = Math.min(255, Math.round(meanErr * 15));
      hist[amplified] += 1;

      const [r, g, b] = toHotspotColor(amplified);
      elaRgba[p] = r;
      elaRgba[p + 1] = g;
      elaRgba[p + 2] = b;

      const sx = Math.min(3, Math.floor((x / w) * 4));
      const secIdx = sy * 4 + sx;
      sectorSums[secIdx] += meanErr;
      sectorCounts[secIdx] += 1;
    }
  }

  const elaMean = Number((sumDiff / Math.max(1, pixelCount)).toFixed(2));
  const elaMax = Number(maxDiff.toFixed(2));

  // P95 amplified value
  let cumulative = 0;
  let elaP95 = 0;
  const target95 = pixelCount * 0.95;
  for (let i = 0; i < 256; i++) {
    cumulative += hist[i];
    if (cumulative >= target95) {
      elaP95 = Number((i / 15).toFixed(2));
      break;
    }
  }

  const sectorMeans = Array.from({ length: 16 }, (_, i) =>
    sectorCounts[i] > 0 ? sectorSums[i] / sectorCounts[i] : 0,
  );
  const minSector = Math.min(...sectorMeans);
  const maxSectorVal = Math.max(...sectorMeans);
  const maxSectorIdx = sectorMeans.indexOf(maxSectorVal);
  const blockVarianceRatio = Number((maxSectorVal / Math.max(0.25, minSector)).toFixed(2));
  const rowLabel = ['Top', 'Upper-Mid', 'Lower-Mid', 'Bottom'][Math.floor(maxSectorIdx / 4)];
  const colLabel = ['Left', 'Center-Left', 'Center-Right', 'Right'][maxSectorIdx % 4];
  const hotspotSector = `${rowLabel} ${colLabel}`;

  const elaFilename = `${crypto.randomUUID()}-ela.png`;
  await sharp(elaRgba, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toFile(path.join(ELA_DIR, elaFilename));

  // 2. Perceptual hash (64-bit dHash on 9x8 grayscale)
  const dhashBuf = await sharp(buffer)
    .rotate()
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = dhashBuf[y * 9 + x];
      const right = dhashBuf[y * 9 + x + 1];
      bits += left > right ? '1' : '0';
    }
  }
  let perceptualHash = '';
  for (let i = 0; i < 64; i += 4) {
    perceptualHash += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  // 3. Real 2D DFT Frequency Spectrum (64x64 grayscale patch)
  const N = 64;
  const grayPatch = await sharp(buffer)
    .rotate()
    .grayscale()
    .resize(N, N, { fit: 'fill' })
    .raw()
    .toBuffer();

  const rowRe = new Float64Array(N * N);
  const rowIm = new Float64Array(N * N);
  for (let y = 0; y < N; y++) {
    const lineRe = new Float64Array(N);
    const lineIm = new Float64Array(N);
    for (let x = 0; x < N; x++) {
      lineRe[x] = grayPatch[y * N + x];
    }
    const [outRe, outIm] = compute1dDft(lineRe, lineIm, N);
    for (let x = 0; x < N; x++) {
      rowRe[y * N + x] = outRe[x];
      rowIm[y * N + x] = outIm[x];
    }
  }

  const mag = new Float64Array(N * N);
  let maxMag = 0;
  for (let x = 0; x < N; x++) {
    const colRe = new Float64Array(N);
    const colIm = new Float64Array(N);
    for (let y = 0; y < N; y++) {
      colRe[y] = rowRe[y * N + x];
      colIm[y] = rowIm[y * N + x];
    }
    const [outRe, outIm] = compute1dDft(colRe, colIm, N);
    for (let y = 0; y < N; y++) {
      // Shift zero-frequency to center
      const sy = (y + N / 2) % N;
      const sx = (x + N / 2) % N;
      const m = Math.log1p(Math.hypot(outRe[y], outIm[y]));
      mag[sy * N + sx] = m;
      if (m > maxMag) maxMag = m;
    }
  }

  // Compute radial energy & periodic off-center spikes
  let lowEnergy = 0;
  let highEnergy = 0;
  let periodicSpikeSum = 0;
  let periodicCount = 0;
  const fftImg = Buffer.alloc(N * N * 3);

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dist = Math.hypot(x - N / 2, y - N / 2);
      const val = mag[y * N + x];
      if (dist < N * 0.18) lowEnergy += val;
      else if (dist > N * 0.3) highEnergy += val;

      // Check orthogonal axes away from DC for GAN/upsampling grid artifacts
      if ((Math.abs(x - N / 2) <= 1 || Math.abs(y - N / 2) <= 1) && dist > 6) {
        periodicSpikeSum += val;
        periodicCount += 1;
      }

      const norm = Math.min(255, Math.round((val / Math.max(1, maxMag)) * 255));
      const p = (y * N + x) * 3;
      // Cyan-amber spectrum color map
      fftImg[p] = Math.round(norm * 0.25);
      fftImg[p + 1] = Math.round(norm * 0.85);
      fftImg[p + 2] = Math.min(255, Math.round(norm * 1.1));
    }
  }

  const fftHighFreqRatio = Number((highEnergy / Math.max(1, lowEnergy)).toFixed(2));
  const avgPeriodic = periodicCount > 0 ? periodicSpikeSum / periodicCount : 0;
  const fftPeriodicPeakScore = Number(((avgPeriodic / Math.max(1, maxMag)) * 100).toFixed(1));

  const fftFilename = `${crypto.randomUUID()}-fft.png`;
  await sharp(fftImg, { raw: { width: N, height: N, channels: 3 } })
    .resize(256, 256, { kernel: sharp.kernel.nearest })
    .png()
    .toFile(path.join(ELA_DIR, fftFilename));

  // 4. Real EXIF / Metadata Inspection via exifr
  let parsedExif: Record<string, unknown> | null = null;
  try {
    parsedExif = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      iptc: true,
    });
  } catch {
    parsedExif = null;
  }

  const rawTags: Record<string, string | number> = {};
  if (parsedExif) {
    for (const [key, value] of Object.entries(parsedExif)) {
      if (typeof value === 'string' || typeof value === 'number') {
        rawTags[key] = typeof value === 'string' ? value.slice(0, 120) : Number(value.toFixed(5));
      } else if (value instanceof Date && !Number.isNaN(value.getTime())) {
        rawTags[key] = value.toISOString();
      }
    }
  }

  const make = typeof parsedExif?.Make === 'string' ? parsedExif.Make.trim() : null;
  const model = typeof parsedExif?.Model === 'string' ? parsedExif.Model.trim() : null;
  const software = typeof parsedExif?.Software === 'string' ? parsedExif.Software.trim() : null;
  let dateTimeOriginal: string | null = null;
  if (parsedExif?.DateTimeOriginal instanceof Date) {
    dateTimeOriginal = parsedExif.DateTimeOriginal.toISOString();
  } else if (typeof parsedExif?.DateTimeOriginal === 'string') {
    dateTimeOriginal = parsedExif.DateTimeOriginal;
  }

  const gpsLatitude =
    typeof parsedExif?.latitude === 'number' && Number.isFinite(parsedExif.latitude)
      ? Number(parsedExif.latitude.toFixed(4))
      : null;
  const gpsLongitude =
    typeof parsedExif?.longitude === 'number' && Number.isFinite(parsedExif.longitude)
      ? Number(parsedExif.longitude.toFixed(4))
      : null;

  const hasExif = Boolean(parsedExif && Object.keys(rawTags).length > 0);

  const manipulationIndicators: string[] = [];
  if (blockVarianceRatio >= 2.2) {
    manipulationIndicators.push(
      `Localized ELA sector variance (${blockVarianceRatio}x) concentrated in ${hotspotSector}`,
    );
  }
  if (elaMax >= 18) {
    manipulationIndicators.push(
      `Elevated peak JPEG error residual (${elaMax}) relative to frame mean (${elaMean})`,
    );
  }
  if (software && /(photoshop|gimp|lightroom|snapseed|picsart|canva|affinity|pixelmator)/i.test(software)) {
    manipulationIndicators.push(`Post-capture image editor tag detected in EXIF Software: "${software}"`);
  }
  if (manipulationIndicators.length === 0) {
    manipulationIndicators.push('No strong localized ELA block-variance or editing-software markers detected');
  }

  const aiGenerationIndicators: string[] = [];
  if (fftPeriodicPeakScore >= 42) {
    aiGenerationIndicators.push(
      `Elevated orthogonal FFT spectral spike score (${fftPeriodicPeakScore}) — consistent with upsampling grids or synthetic resampling`,
    );
  }
  if (fftHighFreqRatio < 0.48) {
    aiGenerationIndicators.push(
      `Steep high-frequency spectral roll-off (${fftHighFreqRatio}) — potential diffusion smoothing or heavy recompression`,
    );
  }
  if (!hasExif && !make && !model) {
    aiGenerationIndicators.push(
      'Camera EXIF hardware metadata absent (common in both AI-generated outputs and social-media re-uploads)',
    );
  }
  if (software && /(midjourney|dall-e|stable diffusion|comfyui|firefly|imagen|flux)/i.test(software)) {
    aiGenerationIndicators.push(`Generative tool signature recorded in metadata: "${software}"`);
  }
  if (aiGenerationIndicators.length === 0) {
    aiGenerationIndicators.push('No prominent periodic FFT upsampling spikes or generative software signatures detected');
  }

  const sortedMeans = [...sectorMeans].sort((a, b) => a - b);
  const medianSector = sortedMeans[Math.floor(sortedMeans.length / 2)] || 0.25;
  const rowLabels = ['Top', 'Upper-Mid', 'Lower-Mid', 'Bottom'];
  const colLabels = ['Left', 'Center-Left', 'Center-Right', 'Right'];

  const suspiciousRegions = sectorMeans
    .map((m, idx) => {
      const ratio = Number((m / Math.max(0.25, medianSector)).toFixed(2));
      const sector = `${rowLabels[Math.floor(idx / 4)]} ${colLabels[idx % 4]}`;
      const severity: 'Low' | 'Medium' | 'High' =
        ratio >= 2.2 || m >= 10 ? 'High' : ratio >= 1.55 || m >= 5 ? 'Medium' : 'Low';
      return {
        sector,
        meanError: Number(m.toFixed(2)),
        ratioToMedian: ratio,
        severity,
        note:
          severity === 'High'
            ? `Elevated compression error residual (${ratio}x sector median)`
            : severity === 'Medium'
              ? `Moderate edge/texture residual (${ratio}x sector median)`
              : 'Baseline compression profile',
      };
    })
    .filter((r) => r.severity !== 'Low')
    .sort((a, b) => b.meanError - a.meanError)
    .slice(0, 4);

  return {
    width: origWidth,
    height: origHeight,
    elaMean,
    elaMax,
    elaP95,
    blockVarianceRatio,
    hotspotSector,
    fftHighFreqRatio,
    fftPeriodicPeakScore,
    perceptualHash,
    elaFilename,
    fftFilename,
    manipulationIndicators,
    aiGenerationIndicators,
    suspiciousRegions,
    integrityCheck: {
      formatVerified: true,
      dimensions: `${origWidth}x${origHeight}`,
      hasHardwareExif: Boolean(make || model),
      editingSoftwareTag: software,
    },
    exifSummary: {
      make,
      model,
      software,
      dateTimeOriginal,
      gpsLatitude,
      gpsLongitude,
      hasExif,
      rawTags,
    },
  };
}
