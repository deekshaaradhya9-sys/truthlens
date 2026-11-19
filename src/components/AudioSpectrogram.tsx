import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Play, Square } from 'lucide-react';
import { fetchAuthorizedResponse } from '../utils/api.ts';
import type { EvidenceItem } from '../types/forensics.ts';

interface AudioSpectrogramProps {
  caseId: string;
  evidence: EvidenceItem;
}

function fftInPlace(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

interface DiscontinuityWin {
  startSec: number;
  endSec: number;
  deltaDb: number;
  note: string;
}

function analyzeClientPcmDiscontinuities(
  channel: Float32Array,
  sampleRate: number,
): { rmsDb: number; windows: DiscontinuityWin[] } {
  if (!channel.length || sampleRate <= 0) {
    return { rmsDb: -96, windows: [] };
  }
  let totalSq = 0;
  for (let i = 0; i < channel.length; i++) {
    totalSq += channel[i] * channel[i];
  }
  const overallRms = Math.sqrt(totalSq / channel.length);
  const rmsDb = overallRms > 0 ? Number((20 * Math.log10(overallRms)).toFixed(1)) : -96;

  const winSamples = Math.max(1024, Math.floor(sampleRate * 0.25));
  const stats: Array<{ startSec: number; endSec: number; rmsDb: number; zcr: number }> = [];
  for (let start = 0; start + winSamples <= channel.length; start += winSamples) {
    let sq = 0;
    let zcr = 0;
    for (let i = 0; i < winSamples; i++) {
      const s = channel[start + i];
      sq += s * s;
      if (i > 0) {
        const prev = channel[start + i - 1];
        if ((prev >= 0 && s < 0) || (prev < 0 && s >= 0)) zcr++;
      }
    }
    const wRms = Math.sqrt(sq / winSamples);
    const wDb = wRms > 0 ? 20 * Math.log10(wRms) : -96;
    stats.push({
      startSec: Number((start / sampleRate).toFixed(2)),
      endSec: Number(((start + winSamples) / sampleRate).toFixed(2)),
      rmsDb: wDb,
      zcr: zcr / winSamples,
    });
  }

  const meanZcr = stats.length ? stats.reduce((a, b) => a + b.zcr, 0) / stats.length : 0;
  const windows: DiscontinuityWin[] = [];
  for (let i = 1; i < stats.length; i++) {
    const prev = stats[i - 1];
    const curr = stats[i];
    const deltaDb = Math.abs(curr.rmsDb - prev.rmsDb);
    const zcrShift = Math.abs(curr.zcr - prev.zcr);
    if ((deltaDb > 4.5 || zcrShift > meanZcr * 0.48) && windows.length < 4) {
      windows.push({
        startSec: curr.startSec,
        endSec: curr.endSec,
        deltaDb: Number(deltaDb.toFixed(1)),
        note: `Client PCM splice / energy transition (${deltaDb.toFixed(1)} dB jump, ZCR shift ${(zcrShift * 100).toFixed(1)}%)`,
      });
    }
  }
  return { rmsDb, windows };
}

export const AudioSpectrogram: React.FC<AudioSpectrogramProps> = ({ caseId, evidence }) => {
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [computedRmsDb, setComputedRmsDb] = useState<number | null>(null);
  const [computedWindows, setComputedWindows] = useState<DiscontinuityWin[]>([]);
  const [specError, setSpecError] = useState<string | null>(null);
  const [blobAudioUrl, setBlobAudioUrl] = useState<string>('');

  const audioUrl = `/api/cases/${caseId}/evidence/${evidence.id}/file`;
  const metrics = (evidence.metrics ?? {}) as {
    sampleRate?: number | null;
    durationSec?: number | null;
    rmsDb?: number | null;
    discontinuityWindows?: DiscontinuityWin[];
  };

  useEffect(() => {
    let cancelled = false;
    let localObjUrl = '';

    async function renderSpectrogram() {
      try {
        const res = await fetchAuthorizedResponse(audioUrl);
        const arrayBuf = await res.arrayBuffer();
        if (cancelled) return;
        const mime = res.headers.get('Content-Type') || evidence.mimeType || 'audio/wav';
        localObjUrl = URL.createObjectURL(new Blob([arrayBuf], { type: mime }));
        setBlobAudioUrl(localObjUrl);
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        if (cancelled) {
          await ctx.close();
          return;
        }
        setDuration(Number(decoded.duration.toFixed(2)));
        const channel = decoded.getChannelData(0);

        const serverWindows = Array.isArray(metrics.discontinuityWindows)
          ? metrics.discontinuityWindows
          : [];
        let activeWindows = serverWindows;
        if (serverWindows.length === 0 || metrics.rmsDb == null) {
          const clientAnalysis = analyzeClientPcmDiscontinuities(channel, decoded.sampleRate);
          if (metrics.rmsDb == null) {
            setComputedRmsDb(clientAnalysis.rmsDb);
          }
          if (serverWindows.length === 0) {
            activeWindows = clientAnalysis.windows;
            setComputedWindows(clientAnalysis.windows);
          }
        }

        // Render PCM Waveform Envelope
        const waveCanvas = waveformCanvasRef.current;
        if (waveCanvas) {
          const wg = waveCanvas.getContext('2d');
          if (wg) {
            const wWidth = waveCanvas.width;
            const wHeight = waveCanvas.height;
            wg.fillStyle = '#050814';
            wg.fillRect(0, 0, wWidth, wHeight);

            const midY = wHeight / 2;
            wg.strokeStyle = 'rgba(148, 163, 184, 0.2)';
            wg.lineWidth = 1;
            wg.beginPath();
            wg.moveTo(0, midY);
            wg.lineTo(wWidth, midY);
            wg.stroke();

            const samplesPerCol = Math.max(1, Math.floor(channel.length / wWidth));
            const grad = wg.createLinearGradient(0, 0, wWidth, 0);
            grad.addColorStop(0, '#06B6D4');
            grad.addColorStop(1, '#8B5CF6');
            wg.fillStyle = grad;

            for (let x = 0; x < wWidth; x++) {
              const start = x * samplesPerCol;
              let minVal = 1;
              let maxVal = -1;
              for (let k = 0; k < samplesPerCol && start + k < channel.length; k++) {
                const v = channel[start + k];
                if (v < minVal) minVal = v;
                if (v > maxVal) maxVal = v;
              }
              const yTop = midY + minVal * (wHeight * 0.45);
              const barH = Math.max(1.5, (maxVal - minVal) * (wHeight * 0.45));
              wg.fillRect(x, yTop, 1, barH);
            }

            const totalDur = decoded.duration || metrics.durationSec || 5;
            for (const win of activeWindows) {
              const x1 = (win.startSec / totalDur) * wWidth;
              const x2 = (win.endSec / totalDur) * wWidth;
              wg.fillStyle = 'rgba(245, 158, 11, 0.2)';
              wg.fillRect(x1, 0, Math.max(4, x2 - x1), wHeight);
            }
          }
        }

        const canvas = canvasRef.current;
        if (canvas) {
          const g = canvas.getContext('2d');
          if (g) {
            const width = canvas.width;
            const height = canvas.height;
            g.fillStyle = '#060911';
            g.fillRect(0, 0, width, height);

            const fftSize = 256;
            const bins = fftSize / 2;
            const cols = Math.min(width, 220);
            const colWidth = width / cols;
            const step = Math.max(1, Math.floor((channel.length - fftSize) / cols));

            const re = new Float32Array(fftSize);
            const im = new Float32Array(fftSize);

            for (let c = 0; c < cols; c++) {
              const offset = c * step;
              for (let i = 0; i < fftSize; i++) {
                const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
                re[i] = (channel[offset + i] ?? 0) * w;
                im[i] = 0;
              }
              fftInPlace(re, im);

              for (let b = 0; b < bins; b++) {
                const mag = Math.hypot(re[b], im[b]);
                const norm = Math.min(1, Math.log1p(mag * 4) / 3.2);
                const y = height - ((b + 1) / bins) * height;
                const rowH = height / bins + 0.5;

                if (norm < 0.45) {
                  const k = norm / 0.45;
                  g.fillStyle = `rgb(${Math.round(8 + k * 6)}, ${Math.round(14 + k * 140)}, ${Math.round(28 + k * 170)})`;
                } else {
                  const k = (norm - 0.45) / 0.55;
                  g.fillStyle = `rgb(${Math.round(14 + k * 235)}, ${Math.round(154 + k * 20)}, ${Math.round(198 - k * 180)})`;
                }
                g.fillRect(c * colWidth, y, colWidth + 0.8, rowH);
              }
            }

            const totalDur = decoded.duration || metrics.durationSec || 5;
            for (const win of activeWindows) {
              const x1 = (win.startSec / totalDur) * width;
              const x2 = (win.endSec / totalDur) * width;
              g.strokeStyle = 'rgba(245, 158, 11, 0.95)';
              g.lineWidth = 2;
              g.strokeRect(x1, 2, Math.max(4, x2 - x1), height - 4);
              g.fillStyle = 'rgba(245, 158, 11, 0.14)';
              g.fillRect(x1, 2, Math.max(4, x2 - x1), height - 4);
            }
          }
        }
        await ctx.close();
      } catch (err) {
        if (!cancelled) {
          setSpecError(err instanceof Error ? err.message : 'Unable to decode spectrogram');
        }
      }
    }

    renderSpectrogram();
    return () => {
      cancelled = true;
      if (localObjUrl) URL.revokeObjectURL(localObjUrl);
    };
  }, [audioUrl, evidence.mimeType, metrics.durationSec, metrics.discontinuityWindows, metrics.rmsDb]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el || !blobAudioUrl) return;
    if (playing) {
      el.pause();
      el.currentTime = 0;
      setPlaying(false);
    } else {
      el.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  const displayWindows =
    (metrics.discontinuityWindows?.length ?? 0) > 0
      ? metrics.discontinuityWindows!
      : computedWindows;
  const displayRmsDb = metrics.rmsDb ?? computedRmsDb ?? 'n/a';

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Volume2 className="w-4 h-4 text-cyan-400" />
          <div>
            <h4 className="text-sm font-semibold text-white">{evidence.originalFilename}</h4>
            <div className="text-xs font-mono text-slate-400 tabular-nums">
              {metrics.sampleRate ? `${metrics.sampleRate} Hz` : evidence.mimeType} ·{' '}
              {duration || metrics.durationSec || '?'}s · RMS {displayRmsDb} dB
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500 text-xs font-medium text-slate-100 cursor-pointer"
        >
          {playing ? <Square className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-cyan-400" />}
          <span>{playing ? 'Stop Audio' : 'Play Sample'}</span>
        </button>
      </div>

      <div className="p-4 space-y-3">
        <audio
          ref={audioRef}
          src={blobAudioUrl || undefined}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />

        <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
          <canvas ref={waveformCanvasRef} width={680} height={84} className="w-full h-20 block" />
          <div className="px-3 py-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>Time-Domain PCM Waveform (Cyan → Violet)</span>
            <span>Amplitude Envelope</span>
          </div>
        </div>

        <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
          <canvas ref={canvasRef} width={680} height={170} className="w-full h-40 block" />
          <div className="px-3 py-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>0.00s · Frequency 0–8 kHz (Hann FFT)</span>
            <span className="text-amber-300">Amber box = flagged discontinuity segment</span>
          </div>
        </div>

        {specError && <div className="text-xs text-amber-300">{specError}</div>}

        {displayWindows.length > 0 && (
          <div className="space-y-1.5">
            {displayWindows.map((w, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg bg-amber-950/25 border border-amber-800/40"
              >
                <span className="font-mono text-amber-300 tabular-nums">
                  {w.startSec.toFixed(2)}s – {w.endSec.toFixed(2)}s
                </span>
                <span className="text-slate-300">{w.note}</span>
                <span className="font-mono text-slate-400 tabular-nums">Δ {w.deltaDb} dB</span>
              </div>
            ))}
          </div>
        )}

        {evidence.transcript && (
          <div className="text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-3 leading-relaxed">
            <span className="font-mono text-slate-500 block mb-1">Extracted Transcript / Acoustic Notes</span>
            {evidence.transcript}
          </div>
        )}
      </div>
    </div>
  );
};
