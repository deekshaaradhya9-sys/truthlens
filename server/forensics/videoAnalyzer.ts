export interface VideoContainerMetrics {
  containerFormat: 'mp4' | 'webm';
  majorBrand: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasAudioTrack: boolean | null;
  creationTimestamp: string | null;
  frameCount: number;
  suspiciousCount: number;
  maxFrameDelta: number;
  flaggedTimestamps: number[];
  audioSyncNote: string | null;
  temporalConsistencyNote: string;
}

const MAC_EPOCH_OFFSET_SEC = 2082844800; // Seconds between 1904-01-01 and 1970-01-01

export function analyzeVideoBuffer(
  buf: Buffer,
  mimeType: string,
  clientMeta: {
    durationSec?: number;
    width?: number;
    height?: number;
    hasAudioTrack?: boolean | null;
    audioSyncNote?: string;
    frames?: Array<{ timestampSec: number; deltaScore: number; suspicious: boolean }>;
  } = {},
): VideoContainerMetrics {
  const frames = clientMeta.frames ?? [];
  const suspiciousFrames = frames.filter((f) => f.suspicious);
  const maxDelta = frames.reduce((m, f) => Math.max(m, f.deltaScore), 0);
  const flaggedTimestamps = suspiciousFrames.map((f) => f.timestampSec);

  let containerFormat: 'mp4' | 'webm' = mimeType === 'video/webm' ? 'webm' : 'mp4';
  let majorBrand: string | null = null;
  let durationSec: number | null = clientMeta.durationSec ?? null;
  let width: number | null = clientMeta.width ?? null;
  let height: number | null = clientMeta.height ?? null;
  let hasAudioTrack: boolean | null = clientMeta.hasAudioTrack ?? null;
  let creationTimestamp: string | null = null;

  if (buf.length >= 16 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    containerFormat = 'mp4';
    majorBrand = buf.subarray(8, 12).toString('ascii').trim() || null;

    // Parse mvhd box for container duration and creation time
    const mvhdIdx = buf.indexOf(Buffer.from('mvhd'));
    if (mvhdIdx !== -1 && mvhdIdx + 24 < buf.length) {
      const version = buf[mvhdIdx + 4];
      if (version === 0 && mvhdIdx + 24 < buf.length) {
        const cTime = buf.readUInt32BE(mvhdIdx + 8);
        const timescale = buf.readUInt32BE(mvhdIdx + 16);
        const durUnits = buf.readUInt32BE(mvhdIdx + 20);
        if (timescale > 0 && durUnits > 0 && !durationSec) {
          durationSec = Number((durUnits / timescale).toFixed(2));
        }
        if (cTime > MAC_EPOCH_OFFSET_SEC) {
          creationTimestamp = new Date((cTime - MAC_EPOCH_OFFSET_SEC) * 1000).toISOString();
        }
      }
    }

    // Parse tkhd box width/height (16.16 fixed point at offset 76 & 80 from 'tkhd' for v0)
    const tkhdIdx = buf.indexOf(Buffer.from('tkhd'));
    if (tkhdIdx !== -1 && tkhdIdx + 84 < buf.length) {
      const version = buf[tkhdIdx + 4];
      const dimOffset = version === 0 ? tkhdIdx + 76 : tkhdIdx + 88;
      if (dimOffset + 8 <= buf.length) {
        const w = buf.readUInt16BE(dimOffset);
        const h = buf.readUInt16BE(dimOffset + 4);
        if (w > 0 && h > 0 && (!width || !height)) {
          width = w;
          height = h;
        }
      }
    }

    // Check MP4 handler box for audio track ('soun')
    if (hasAudioTrack === null) {
      hasAudioTrack = buf.indexOf(Buffer.from('soun')) !== -1;
    }
  } else if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    containerFormat = 'webm';
    majorBrand = 'webm/ebml';
    if (hasAudioTrack === null) {
      const hasOpusOrVorbis =
        buf.indexOf(Buffer.from('A_OPUS')) !== -1 || buf.indexOf(Buffer.from('A_VORBIS')) !== -1;
      hasAudioTrack = hasOpusOrVorbis;
    }
  }

  const audioSyncNote =
    clientMeta.audioSyncNote ??
    (hasAudioTrack === true
      ? `Container includes an audio track (${containerFormat.toUpperCase()}); verify spoken speech timing against flagged frame timestamps.`
      : hasAudioTrack === false
        ? 'No audio track detected in container header (silent clip or stripped audio stream).'
        : 'Audio track presence indeterminate from container header.');

  const temporalConsistencyNote =
    frames.length === 0
      ? 'Container header inspected server-side; browser keyframe sampling unavailable for this codec.'
      : suspiciousFrames.length > 0
        ? `${suspiciousFrames.length} of ${frames.length} sampled keyframes showed elevated temporal luminance jumps (at ${flaggedTimestamps.map((t) => `${t}s`).join(', ')}).`
        : `All ${frames.length} sampled keyframes showed smooth temporal continuity (max Δ ${maxDelta.toFixed(1)}).`;

  return {
    containerFormat,
    majorBrand,
    durationSec,
    width,
    height,
    hasAudioTrack,
    creationTimestamp,
    frameCount: frames.length,
    suspiciousCount: suspiciousFrames.length,
    maxFrameDelta: Number(maxDelta.toFixed(2)),
    flaggedTimestamps,
    audioSyncNote,
    temporalConsistencyNote,
  };
}
