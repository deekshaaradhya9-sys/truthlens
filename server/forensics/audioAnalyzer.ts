export interface AudioSignalMetrics {
  format: string;
  sampleRate: number | null;
  channels: number | null;
  bitrateKbps: number | null;
  durationSec: number | null;
  rmsDb: number | null;
  segmentEnergyVariance: number | null;
  syntheticSpeechIndicators: string[];
  discontinuityWindows: Array<{
    startSec: number;
    endSec: number;
    deltaDb: number;
    note: string;
  }>;
}

function parseMp3HeaderMetrics(buf: Buffer, mimeType: string): AudioSignalMetrics {
  let offset = 0;
  let hasId3 = false;
  if (buf.length > 10 && buf.subarray(0, 3).toString('ascii') === 'ID3') {
    hasId3 = true;
    const size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    offset = Math.min(buf.length - 4, 10 + size);
  }

  let sampleRate: number | null = null;
  let bitrateKbps: number | null = null;
  let channels: number | null = null;

  const bitrateTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const sampleRates = [44100, 48000, 32000, 0];

  for (let i = offset; i < Math.min(buf.length - 4, offset + 4096); i++) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const b1 = buf[i + 1];
      const b2 = buf[i + 2];
      const b3 = buf[i + 3];
      const versionBits = (b1 >> 3) & 0x03;
      const layerBits = (b1 >> 1) & 0x03;
      const brIdx = (b2 >> 4) & 0x0f;
      const srIdx = (b2 >> 2) & 0x03;
      const chMode = (b3 >> 6) & 0x03;
      if (versionBits === 3 && layerBits === 1 && brIdx > 0 && brIdx < 15 && srIdx < 3) {
        bitrateKbps = bitrateTable[brIdx];
        sampleRate = sampleRates[srIdx];
        channels = chMode === 3 ? 1 : 2;
        break;
      }
    }
  }

  const audioBytes = Math.max(0, buf.length - offset);
  const durationSec =
    bitrateKbps && bitrateKbps > 0
      ? Number(((audioBytes * 8) / (bitrateKbps * 1000)).toFixed(2))
      : null;

  const syntheticSpeechIndicators: string[] = [];
  if (sampleRate && sampleRate <= 24000) {
    syntheticSpeechIndicators.push(
      `Low codec sample rate (${sampleRate} Hz) — common in vocoder outputs and telephony compression`,
    );
  }
  if (!hasId3) {
    syntheticSpeechIndicators.push('No ID3 container tag present (raw bitstream or stripped export)');
  }
  if (syntheticSpeechIndicators.length === 0) {
    syntheticSpeechIndicators.push(
      'Compressed MPEG audio inspected; browser spectrogram + Gemini audio pass evaluate formant & pitch cadence',
    );
  }

  return {
    format: mimeType,
    sampleRate,
    channels,
    bitrateKbps,
    durationSec,
    rmsDb: null,
    segmentEnergyVariance: null,
    syntheticSpeechIndicators,
    discontinuityWindows: [],
  };
}

function parseM4aOrOggMetrics(buf: Buffer, mimeType: string): AudioSignalMetrics {
  let durationSec: number | null = null;
  let sampleRate: number | null = null;

  if (mimeType === 'audio/ogg') {
    const opusIdx = buf.indexOf(Buffer.from('OpusHead'));
    const vorbisIdx = buf.indexOf(Buffer.from('vorbis'));
    if (opusIdx !== -1 && opusIdx + 16 < buf.length) {
      sampleRate = buf.readUInt32LE(opusIdx + 12) || 48000;
    } else if (vorbisIdx !== -1 && vorbisIdx + 16 < buf.length) {
      sampleRate = buf.readUInt32LE(vorbisIdx + 12) || null;
    }
  } else if (mimeType === 'audio/mp4') {
    const mvhdIdx = buf.indexOf(Buffer.from('mvhd'));
    if (mvhdIdx !== -1 && mvhdIdx + 24 < buf.length) {
      const version = buf[mvhdIdx + 4];
      const timescale = version === 0 ? buf.readUInt32BE(mvhdIdx + 16) : buf.readUInt32BE(mvhdIdx + 24);
      const durUnits = version === 0 ? buf.readUInt32BE(mvhdIdx + 20) : Number(buf.readBigUInt64BE(mvhdIdx + 28));
      if (timescale > 0 && durUnits > 0) {
        durationSec = Number((durUnits / timescale).toFixed(2));
      }
    }
  }

  return {
    format: mimeType,
    sampleRate,
    channels: null,
    bitrateKbps: null,
    durationSec,
    rmsDb: null,
    segmentEnergyVariance: null,
    syntheticSpeechIndicators: [
      `Container (${mimeType}) decoded in client WebAudio spectrogram & Gemini acoustic inspection.`,
    ],
    discontinuityWindows: [],
  };
}

export function analyzeAudioBuffer(buf: Buffer, mimeType: string): AudioSignalMetrics {
  const isWav =
    buf.length > 44 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WAVE';

  if (!isWav) {
    if (mimeType === 'audio/mpeg') {
      return parseMp3HeaderMetrics(buf, mimeType);
    }
    return parseM4aOrOggMetrics(buf, mimeType);
  }

  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const byteRate = buf.readUInt32LE(28);
  const bitsPerSample = buf.readUInt16LE(34);
  const bitrateKbps = byteRate > 0 ? Math.round((byteRate * 8) / 1000) : null;

  let offset = 12;
  let dataOffset = 44;
  let dataSize = Math.max(0, buf.length - 44);
  while (offset + 8 < buf.length) {
    const chunkId = buf.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, buf.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const bytesPerSample = Math.max(1, bitsPerSample / 8);
  const totalSamples = Math.floor(dataSize / (bytesPerSample * Math.max(1, channels)));
  const durationSec = sampleRate > 0 ? Number((totalSamples / sampleRate).toFixed(2)) : null;

  if (bitsPerSample !== 16 || sampleRate <= 0 || totalSamples < 100) {
    return {
      format: 'audio/wav',
      sampleRate,
      channels,
      bitrateKbps,
      durationSec,
      rmsDb: null,
      segmentEnergyVariance: null,
      syntheticSpeechIndicators: ['Non-16-bit PCM WAV stream; acoustic inspection limited.'],
      discontinuityWindows: [],
    };
  }

  const windowSamples = Math.max(1, Math.floor(sampleRate * 0.25));
  const windowRmsDb: number[] = [];
  const windowZcr: number[] = [];
  let globalSqSum = 0;
  let globalCount = 0;

  for (let start = 0; start + windowSamples <= totalSamples; start += windowSamples) {
    let sqSum = 0;
    let zc = 0;
    let prev = 0;
    for (let i = 0; i < windowSamples; i++) {
      const bytePos = dataOffset + (start + i) * channels * 2;
      if (bytePos + 1 >= buf.length) break;
      const sample = buf.readInt16LE(bytePos) / 32768;
      sqSum += sample * sample;
      if (i > 0 && ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0))) {
        zc += 1;
      }
      prev = sample;
    }
    const rms = Math.sqrt(sqSum / windowSamples);
    const db = Number((20 * Math.log10(Math.max(rms, 1e-6))).toFixed(2));
    windowRmsDb.push(db);
    windowZcr.push(zc / windowSamples);
    globalSqSum += sqSum;
    globalCount += windowSamples;
  }

  const globalRms = Math.sqrt(globalSqSum / Math.max(1, globalCount));
  const rmsDb = Number((20 * Math.log10(Math.max(globalRms, 1e-6))).toFixed(2));

  const meanZcr =
    windowZcr.reduce((acc, v) => acc + v, 0) / Math.max(1, windowZcr.length);
  const meanDb =
    windowRmsDb.reduce((acc, v) => acc + v, 0) / Math.max(1, windowRmsDb.length);
  const variance =
    windowRmsDb.reduce((acc, v) => acc + (v - meanDb) ** 2, 0) /
    Math.max(1, windowRmsDb.length);

  const discontinuityWindows: AudioSignalMetrics['discontinuityWindows'] = [];
  for (let i = 1; i < windowRmsDb.length; i++) {
    const deltaDb = Math.abs(windowRmsDb[i] - windowRmsDb[i - 1]);
    const zcrShift = Math.abs(windowZcr[i] - meanZcr);
    if (deltaDb > 4.5 || zcrShift > meanZcr * 0.48) {
      const startSec = Number((i * 0.25).toFixed(2));
      const endSec = Number(((i + 1) * 0.25).toFixed(2));
      const last = discontinuityWindows[discontinuityWindows.length - 1];
      if (last && startSec - last.endSec <= 0.3) {
        last.endSec = endSec;
        last.deltaDb = Math.max(last.deltaDb, Number(deltaDb.toFixed(1)));
      } else {
        discontinuityWindows.push({
          startSec,
          endSec,
          deltaDb: Number(deltaDb.toFixed(1)),
          note:
            deltaDb > 4.5
              ? 'Abrupt RMS noise-floor / amplitude step shift'
              : 'Zero-crossing spectral centroid shift',
        });
      }
    }
  }

  const syntheticSpeechIndicators: string[] = [];
  if (discontinuityWindows.length > 0) {
    syntheticSpeechIndicators.push(
      `${discontinuityWindows.length} acoustic discontinuity window(s) detected (possible audio splice or TTS segment stitching)`,
    );
  }
  if (variance < 6 && windowRmsDb.length >= 4) {
    syntheticSpeechIndicators.push(
      `Unusually flat segment energy variance (${variance.toFixed(2)} dB²) — can indicate neural vocoder normalization`,
    );
  }
  if (sampleRate <= 22050) {
    syntheticSpeechIndicators.push(
      `Sample rate ${sampleRate} Hz — consistent with common TTS/voice-cloning pipelines or narrowband recording`,
    );
  }
  if (syntheticSpeechIndicators.length === 0) {
    syntheticSpeechIndicators.push('No strong amplitude splice or flat-energy vocoder markers in PCM windows');
  }

  return {
    format: 'audio/wav',
    sampleRate,
    channels,
    bitrateKbps,
    durationSec,
    rmsDb,
    segmentEnergyVariance: Number(variance.toFixed(2)),
    syntheticSpeechIndicators,
    discontinuityWindows,
  };
}
