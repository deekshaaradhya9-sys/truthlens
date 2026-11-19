import type { VideoFrameSample, VideoMetadataInfo } from '../types/forensics.ts';

export interface VideoExtractionResult {
  frames: VideoFrameSample[];
  metadata: VideoMetadataInfo;
}

/**
 * Safely attempts to extract up to 8 evenly spaced frames from a video File client-side.
 * Includes strict timeouts so unplayable/unsupported codecs (e.g. HEVC MP4 or container-only clips)
 * fall back cleanly without stalling or aborting the file upload.
 */
export async function extractVideoKeyframes(file: File): Promise<VideoExtractionResult> {
  const fallbackResult = (note: string): VideoExtractionResult => ({
    frames: [],
    metadata: {
      durationSec: null,
      width: null,
      height: null,
      hasAudioTrack: null,
      audioSyncNote: note,
      browserDecodeNote: note,
    },
  });

  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return fallbackResult('Browser video decoder unavailable; container will be inspected server-side.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    const metaLoaded = await new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(false);
        }
      }, 4500);

      const onLoaded = () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(true);
        }
      };
      const onError = () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(false);
        }
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
    });

    if (!metaLoaded) {
      return fallbackResult(
        'Browser codec decoder timed out or unsupported stream; server-side container header analysis applied.',
      );
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 4;
    const rawWidth = video.videoWidth || null;
    const rawHeight = video.videoHeight || null;

    const videoAny = video as HTMLVideoElement & {
      audioTracks?: { length: number };
      mozHasAudio?: boolean;
      webkitAudioDecodedByteCount?: number;
    };
    let hasAudioTrack: boolean | null = null;
    if (videoAny.audioTracks && typeof videoAny.audioTracks.length === 'number') {
      hasAudioTrack = videoAny.audioTracks.length > 0;
    } else if (typeof videoAny.mozHasAudio === 'boolean') {
      hasAudioTrack = videoAny.mozHasAudio;
    } else if (typeof videoAny.webkitAudioDecodedByteCount === 'number') {
      hasAudioTrack = videoAny.webkitAudioDecodedByteCount > 0;
    }

    const audioSyncNote =
      hasAudioTrack === true
        ? `Embedded audio track detected across ${duration.toFixed(1)}s container; compare spoken cadence against flagged keyframe timestamps.`
        : hasAudioTrack === false
          ? 'No embedded audio track detected (silent video container or stripped audio stream).'
          : `Container duration ${duration.toFixed(1)}s (${rawWidth ?? '?'}x${rawHeight ?? '?'}); server container check inspects audio track atom.`;

    const width = 280;
    const aspect =
      video.videoWidth && video.videoHeight ? video.videoHeight / video.videoWidth : 9 / 16;
    const height = Math.max(110, Math.round(width * aspect));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        frames: [],
        metadata: {
          durationSec: Number(duration.toFixed(2)),
          width: rawWidth,
          height: rawHeight,
          hasAudioTrack,
          audioSyncNote,
        },
      };
    }

    const sampleCount = 8;
    const samples: Array<{
      timestampSec: number;
      thumbnailDataUrl: string;
      pixels: Uint8ClampedArray;
    }> = [];

    for (let i = 0; i < sampleCount; i++) {
      const t = Math.min(Math.max(0.05, (duration * (i + 0.5)) / sampleCount), duration - 0.05);
      const seekOk = await new Promise<boolean>((resolve) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            video.removeEventListener('seeked', onSeeked);
            resolve(false);
          }
        }, 1200);
        const onSeeked = () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            video.removeEventListener('seeked', onSeeked);
            resolve(true);
          }
        };
        video.addEventListener('seeked', onSeeked);
        try {
          video.currentTime = t;
        } catch {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            video.removeEventListener('seeked', onSeeked);
            resolve(false);
          }
        }
      });

      if (!seekOk) continue;

      try {
        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.62);
        samples.push({
          timestampSec: Number(t.toFixed(2)),
          thumbnailDataUrl,
          pixels: imageData.data,
        });
      } catch {
        // ignore single frame canvas draw errors
      }
    }

    if (samples.length === 0) {
      return {
        frames: [],
        metadata: {
          durationSec: Number(duration.toFixed(2)),
          width: rawWidth,
          height: rawHeight,
          hasAudioTrack,
          audioSyncNote,
          browserDecodeNote: 'Keyframe seek timed out; uploaded binary directly for server header audit.',
        },
      };
    }

    const deltas: number[] = [0];
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1].pixels;
      const curr = samples[i].pixels;
      let diffSum = 0;
      const step = 4 * 4;
      let count = 0;
      for (let p = 0; p < curr.length; p += step) {
        const lumA = 0.299 * prev[p] + 0.587 * prev[p + 1] + 0.114 * prev[p + 2];
        const lumB = 0.299 * curr[p] + 0.587 * curr[p + 1] + 0.114 * curr[p + 2];
        diffSum += Math.abs(lumA - lumB);
        count++;
      }
      const normalized = Math.min(100, Number(((diffSum / Math.max(1, count)) * 1.4).toFixed(1)));
      deltas.push(normalized);
    }

    const meanDelta = deltas.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, deltas.length - 1);
    const threshold = Math.max(18, meanDelta * 1.55);

    return {
      frames: samples.map((s, idx) => ({
        timestampSec: s.timestampSec,
        deltaScore: deltas[idx],
        suspicious: idx > 0 && deltas[idx] >= threshold,
        thumbnailDataUrl: s.thumbnailDataUrl,
      })),
      metadata: {
        durationSec: Number(duration.toFixed(2)),
        width: rawWidth,
        height: rawHeight,
        hasAudioTrack,
        audioSyncNote,
      },
    };
  } catch {
    return fallbackResult('Browser keyframe extraction skipped; server-side container analysis applied.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
