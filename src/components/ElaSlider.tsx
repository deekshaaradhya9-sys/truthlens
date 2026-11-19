import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, Layers, Activity, FileSearch } from 'lucide-react';
import { fetchAuthorizedResponse } from '../utils/api.ts';
import type { EvidenceItem } from '../types/forensics.ts';

interface ElaSliderProps {
  caseId: string;
  evidence: EvidenceItem;
}

export const ElaSlider: React.FC<ElaSliderProps> = ({ caseId, evidence }) => {
  const [viewTab, setViewTab] = useState<'ela' | 'fft' | 'exif'>('ela');
  const [sliderPct, setSliderPct] = useState(55);
  const [overlayMode, setOverlayMode] = useState<'wipe' | 'blend'>('wipe');
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [elaUrl, setElaUrl] = useState<string>('');
  const [fftUrl, setFftUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    const urls: string[] = [];

    const loadMedia = async (endpoint: string, setter: (url: string) => void) => {
      try {
        const res = await fetchAuthorizedResponse(endpoint);
        const blob = await res.blob();
        if (!active) return;
        const objUrl = URL.createObjectURL(blob);
        urls.push(objUrl);
        setter(objUrl);
      } catch {
        // leave empty on error
      }
    };

    loadMedia(`/api/cases/${caseId}/evidence/${evidence.id}/file`, setOriginalUrl);
    if (evidence.hasEla) {
      loadMedia(`/api/cases/${caseId}/evidence/${evidence.id}/ela`, setElaUrl);
    }
    if (evidence.hasFft) {
      loadMedia(`/api/cases/${caseId}/evidence/${evidence.id}/fft`, setFftUrl);
    }

    return () => {
      active = false;
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [caseId, evidence.id, evidence.hasEla, evidence.hasFft]);

  const metrics = (evidence.metrics ?? {}) as Record<string, unknown>;
  const manipulationIndicators = Array.isArray(metrics.manipulationIndicators)
    ? (metrics.manipulationIndicators as string[])
    : [];
  const aiGenerationIndicators = Array.isArray(metrics.aiGenerationIndicators)
    ? (metrics.aiGenerationIndicators as string[])
    : [];
  const suspiciousRegions = Array.isArray(metrics.suspiciousRegions)
    ? (metrics.suspiciousRegions as Array<{
        sector: string;
        meanError: number;
        ratioToMedian: number;
        severity: string;
        note: string;
      }>)
    : [];
  const integrityCheck = (metrics.integrityCheck ?? null) as {
    formatVerified?: boolean;
    dimensions?: string;
    hasHardwareExif?: boolean;
    editingSoftwareTag?: string | null;
  } | null;
  const exif = evidence.exif;

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white">{evidence.originalFilename}</h4>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mt-0.5">
            <span>
              {String(metrics.width ?? '?')}×{String(metrics.height ?? '?')}px
            </span>
            <span aria-hidden="true">·</span>
            <span>dHash {evidence.perceptualHash ?? 'n/a'}</span>
            <span aria-hidden="true">·</span>
            <span>SHA-256 {evidence.sha256.slice(0, 12)}...</span>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800">
          <button
            type="button"
            onClick={() => setViewTab('ela')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              viewTab === 'ela'
                ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-200 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>ELA Heatmap</span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('fft')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              viewTab === 'fft'
                ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-200 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>2D FFT Spectrum</span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('exif')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
              viewTab === 'exif'
                ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-200 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSearch className="w-3.5 h-3.5" />
            <span>EXIF Metadata</span>
          </button>
        </div>
      </div>

      {viewTab === 'ela' && (
        <div className="p-4 space-y-4">
          <div className="relative w-full aspect-[4/3] max-h-[380px] rounded-lg overflow-hidden bg-slate-950 border border-slate-800 select-none">
            {originalUrl && (
              <img
                src={originalUrl}
                alt={`Original ${evidence.originalFilename}`}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            )}

            {elaUrl && overlayMode === 'wipe' && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - sliderPct}% 0 0)` }}
              >
                <img
                  src={elaUrl}
                  alt={`Error Level Analysis heatmap for ${evidence.originalFilename}`}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            {elaUrl && overlayMode === 'blend' && (
              <img
                src={elaUrl}
                alt={`Blended ELA overlay for ${evidence.originalFilename}`}
                className="absolute inset-0 w-full h-full object-contain"
                style={{ opacity: sliderPct / 100 }}
                referrerPolicy="no-referrer"
              />
            )}

            {elaUrl && overlayMode === 'wipe' && (
              <div
                className="absolute inset-y-0 w-0.5 bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)] pointer-events-none"
                style={{ left: `${sliderPct}%` }}
              />
            )}

            <div className="absolute top-2.5 left-2.5 text-[11px] font-mono bg-slate-950/85 text-cyan-300 px-2 py-1 rounded border border-slate-800">
              {overlayMode === 'wipe' ? `ELA ${sliderPct}% / Original` : `ELA Blend ${sliderPct}%`}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[220px]">
              <SlidersHorizontal className="w-4 h-4 text-cyan-400 shrink-0" />
              <label className="text-xs text-slate-300 whitespace-nowrap">
                Heatmap Overlay
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={sliderPct}
                onChange={(e) => setSliderPct(Number(e.target.value))}
                aria-label="Original vs ELA heatmap slider"
                className="flex-1 accent-cyan-400 cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-cyan-300 w-10 text-right">
                {sliderPct}%
              </span>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => setOverlayMode('wipe')}
                className={`px-2.5 py-1 text-xs rounded cursor-pointer ${
                  overlayMode === 'wipe' ? 'bg-slate-800 text-white' : 'text-slate-400'
                }`}
              >
                Split Wipe
              </button>
              <button
                type="button"
                onClick={() => setOverlayMode('blend')}
                className={`px-2.5 py-1 text-xs rounded cursor-pointer ${
                  overlayMode === 'blend' ? 'bg-slate-800 text-white' : 'text-slate-400'
                }`}
              >
                Opacity Blend
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80 text-xs font-mono tabular-nums">
            <div>
              <div className="text-slate-500">ELA Mean / P95</div>
              <div className="text-slate-200 mt-0.5">
                {String(metrics.elaMean ?? '0')} / {String(metrics.elaP95 ?? '0')}
              </div>
            </div>
            <div>
              <div className="text-slate-500">ELA Max Error</div>
              <div className="text-amber-300 mt-0.5">{String(metrics.elaMax ?? '0')}</div>
            </div>
            <div>
              <div className="text-slate-500">Sector Variance</div>
              <div className="text-cyan-300 mt-0.5">{String(metrics.blockVarianceRatio ?? '1.0')}×</div>
            </div>
            <div>
              <div className="text-slate-500">Peak Sector</div>
              <div className="text-slate-200 mt-0.5">{String(metrics.hotspotSector ?? 'Uniform')}</div>
            </div>
          </div>

          {(manipulationIndicators.length > 0 || aiGenerationIndicators.length > 0) && (
            <div className="grid md:grid-cols-2 gap-3 pt-3 border-t border-slate-800/80 text-xs">
              <div className="rounded-lg bg-slate-950/90 border border-cyan-500/20 p-3 space-y-1.5">
                <div className="font-mono text-[11px] uppercase tracking-wider text-cyan-300">
                  Image Manipulation Indicators
                </div>
                <ul className="space-y-1 text-slate-300 list-disc pl-4 leading-relaxed">
                  {manipulationIndicators.map((ind, i) => (
                    <li key={i}>{ind}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg bg-slate-950/90 border border-violet-500/20 p-3 space-y-1.5">
                <div className="font-mono text-[11px] uppercase tracking-wider text-violet-300">
                  AI-Generated Image Indicators (2D FFT &amp; Metadata)
                </div>
                <ul className="space-y-1 text-slate-300 list-disc pl-4 leading-relaxed">
                  {aiGenerationIndicators.map((ind, i) => (
                    <li key={i}>{ind}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {(suspiciousRegions.length > 0 || integrityCheck) && (
            <div className="grid md:grid-cols-2 gap-3 pt-2 text-xs">
              {suspiciousRegions.length > 0 && (
                <div className="rounded-lg bg-slate-950/90 border border-amber-500/25 p-3 space-y-1.5">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-amber-300">
                    Suspicious ELA Grid Regions
                  </div>
                  <div className="space-y-1.5">
                    {suspiciousRegions.map((reg, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-slate-300">
                        <span className="font-mono text-white">{reg.sector}</span>
                        <span className="font-mono text-amber-300 tabular-nums">
                          {reg.ratioToMedian}× median · {reg.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {integrityCheck && (
                <div className="rounded-lg bg-slate-950/90 border border-emerald-500/20 p-3 space-y-1.5 font-mono">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-300">
                    Image Integrity Verification
                  </div>
                  <div className="text-slate-300">
                    Header Verified: {integrityCheck.formatVerified ? 'Yes' : 'No'} ·{' '}
                    {integrityCheck.dimensions ?? 'n/a'}
                  </div>
                  <div className="text-slate-400">
                    Hardware EXIF: {integrityCheck.hasHardwareExif ? 'Present' : 'Absent'} · Editor Tag:{' '}
                    {integrityCheck.editingSoftwareTag ?? 'None'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {viewTab === 'fft' && (
        <div className="p-4 grid md:grid-cols-2 gap-6 items-center">
          <div className="aspect-square max-h-[280px] mx-auto rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
            {evidence.hasFft ? (
              <img
                src={fftUrl}
                alt="Centered 2D DFT log-magnitude frequency spectrum"
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                FFT spectrum unavailable
              </div>
            )}
          </div>
          <div className="space-y-3 text-xs">
            <h5 className="text-sm font-semibold text-white">2D Frequency-Spectrum Telemetry</h5>
            <p className="text-slate-400 leading-relaxed">
              Centered 2D Discrete Fourier Transform log-magnitude plot. Synthetic upsampling or
              periodic resizing can leave orthogonal star peaks away from the center DC origin.
            </p>
            <div className="space-y-2 pt-2 border-t border-slate-800 font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-400">High/Low Radial Ratio</span>
                <span className="text-cyan-300">{String(metrics.fftHighFreqRatio ?? 'n/a')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Orthogonal Periodic Index</span>
                <span className="text-amber-300">{String(metrics.fftPeriodicPeakScore ?? 'n/a')}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Perceptual dHash (64-bit)</span>
                <span className="text-slate-200">{evidence.perceptualHash ?? 'n/a'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewTab === 'exif' && (
        <div className="p-4 space-y-3">
          {!exif || !exif.hasExif ? (
            <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded-lg p-3">
              No EXIF/XMP camera header found. Messaging platforms and screenshot tools routinely
              strip metadata, so missing EXIF alone is inconclusive.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">Camera Make / Model</div>
                <div className="text-slate-200 mt-1">
                  {[exif.make, exif.model].filter(Boolean).join(' ') || 'Not recorded'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">DateTimeOriginal</div>
                <div className="text-amber-300 mt-1">{exif.dateTimeOriginal ?? 'Not recorded'}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">GPS Coordinates</div>
                <div className="text-cyan-300 mt-1 tabular-nums">
                  {exif.gpsLatitude !== null && exif.gpsLongitude !== null
                    ? `${exif.gpsLatitude}°, ${exif.gpsLongitude}°`
                    : 'Not embedded'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-500">Software Tag</div>
                <div className="text-rose-300 mt-1">{exif.software ?? 'None'}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
