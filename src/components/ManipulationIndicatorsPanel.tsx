import React, { useState } from 'react';
import { ShieldAlert, Layers, Film, Music, Database, FileText } from 'lucide-react';
import type { ManipulationIndicatorItem } from '../types/forensics.ts';

interface ManipulationIndicatorsPanelProps {
  indicators: ManipulationIndicatorItem[];
}

export const ManipulationIndicatorsPanel: React.FC<ManipulationIndicatorsPanelProps> = ({
  indicators,
}) => {
  const [filter, setFilter] = useState<'all' | ManipulationIndicatorItem['category']>('all');
  const safeIndicators = Array.isArray(indicators) ? indicators : [];

  const filtered =
    filter === 'all' ? safeIndicators : safeIndicators.filter((item) => item.category === filter);

  const categories: Array<{ id: 'all' | ManipulationIndicatorItem['category']; label: string }> = [
    { id: 'all', label: `All (${safeIndicators.length})` },
    { id: 'image_region', label: 'Image Regions' },
    { id: 'video_frame', label: 'Video Anomalies' },
    { id: 'audio_discontinuity', label: 'Audio Discontinuities' },
    { id: 'metadata', label: 'Metadata' },
    { id: 'text_context', label: 'Text / Context' },
  ];

  const getCategoryIcon = (cat: ManipulationIndicatorItem['category']) => {
    switch (cat) {
      case 'image_region':
        return <Layers className="w-3.5 h-3.5 text-cyan-400" />;
      case 'video_frame':
        return <Film className="w-3.5 h-3.5 text-violet-400" />;
      case 'audio_discontinuity':
        return <Music className="w-3.5 h-3.5 text-amber-400" />;
      case 'metadata':
        return <Database className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-rose-400" />;
    }
  };

  return (
    <section className="glass-panel rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">
              Advanced Manipulation Indicators Register
            </h3>
            <p className="text-[11px] text-slate-400">
              Every flagged indicator includes location/timestamp, technical trigger, supporting telemetry, and innocent explanations.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-950/90 border border-slate-800">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilter(cat.id)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                filter === cat.id
                  ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-200 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-xs text-slate-400">
          No manipulation indicators recorded in this category yet.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80">
          {filtered.map((ind) => (
            <div key={ind.id} className="p-5 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {getCategoryIcon(ind.category)}
                  <span className="text-sm font-semibold text-white">{ind.whatDetected}</span>
                </div>
                <span
                  className={`font-mono text-[11px] px-2 py-0.5 rounded border ${
                    ind.severity === 'High'
                      ? 'text-rose-300 border-rose-700/60 bg-rose-950/40'
                      : ind.severity === 'Medium'
                        ? 'text-amber-300 border-amber-700/60 bg-amber-950/40'
                        : 'text-emerald-300 border-emerald-700/60 bg-emerald-950/40'
                  }`}
                >
                  {ind.severity} Severity
                </span>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="rounded-lg bg-slate-950/90 border border-slate-800 p-3 space-y-1">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Where Detected
                  </div>
                  <div className="text-slate-200">{ind.whereDetected}</div>
                </div>

                <div className="rounded-lg bg-slate-950/90 border border-slate-800 p-3 space-y-1">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Timestamp / Region
                  </div>
                  <div className="text-cyan-300 font-mono tabular-nums">{ind.timestampOrRegion}</div>
                </div>

                <div className="rounded-lg bg-slate-950/90 border border-slate-800 p-3 space-y-1 sm:col-span-2 lg:col-span-1">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Supporting Evidence
                  </div>
                  <div className="text-slate-300 leading-relaxed">{ind.supportingEvidence}</div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-950/80 border border-slate-800/90 p-3 space-y-1">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-amber-400">
                    Why Flagged
                  </div>
                  <p className="text-slate-300 leading-relaxed">{ind.whyFlagged}</p>
                </div>

                <div className="rounded-lg bg-slate-950/80 border border-emerald-800/30 p-3 space-y-1">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                    Possible Innocent Explanation
                  </div>
                  <p className="text-slate-300 leading-relaxed">{ind.innocentExplanation}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
