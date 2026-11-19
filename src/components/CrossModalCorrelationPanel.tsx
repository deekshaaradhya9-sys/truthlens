import React from 'react';
import { GitCompare, CheckCircle2, AlertTriangle, HelpCircle, MinusCircle } from 'lucide-react';
import type { CrossModalCorrelationItem } from '../types/forensics.ts';

interface CrossModalCorrelationPanelProps {
  correlations: CrossModalCorrelationItem[];
}

export const CrossModalCorrelationPanel: React.FC<CrossModalCorrelationPanelProps> = ({
  correlations,
}) => {
  const safeCorrelations = Array.isArray(correlations) ? correlations : [];

  const statusConfig = {
    supporting: {
      label: 'Supporting',
      border: 'border-emerald-700/50',
      badge: 'text-emerald-300 bg-emerald-950/50 border-emerald-700/50',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    },
    contradictory: {
      label: 'Contradictory',
      border: 'border-rose-700/60',
      badge: 'text-rose-300 bg-rose-950/50 border-rose-700/60',
      icon: <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />,
    },
    inconclusive: {
      label: 'Inconclusive',
      border: 'border-amber-700/50',
      badge: 'text-amber-300 bg-amber-950/50 border-amber-700/50',
      icon: <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />,
    },
    insufficient_evidence: {
      label: 'Insufficient Evidence',
      border: 'border-slate-800',
      badge: 'text-slate-400 bg-slate-900/70 border-slate-700',
      icon: <MinusCircle className="w-4 h-4 text-slate-500 shrink-0" />,
    },
  };

  return (
    <section className="glass-panel rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-cyan-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">
              Cross-Modal Correlation Engine
            </h3>
            <p className="text-[11px] text-slate-400">
              Compares image, video, audio, captions, timestamps, and location anchors without inventing links when data is missing.
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-slate-400 tabular-nums">
          {safeCorrelations.filter((c) => c.status === 'contradictory').length} contradictory ·{' '}
          {safeCorrelations.filter((c) => c.status === 'supporting').length} supporting
        </span>
      </div>

      {safeCorrelations.length === 0 ? (
        <div className="p-6 text-xs text-slate-400">
          Upload multiple modalities or caption text to run cross-modal correlation checks.
        </div>
      ) : (
        <div className="p-5 grid md:grid-cols-2 gap-4">
          {safeCorrelations.map((corr) => {
            const cfg = statusConfig[corr.status] ?? statusConfig.inconclusive;
            return (
              <div
                key={corr.id}
                className={`rounded-xl border ${cfg.border} bg-slate-950/85 p-4 space-y-3 text-xs`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {cfg.icon}
                    <h4 className="font-semibold text-white text-[13px]">{corr.pairLabel}</h4>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase shrink-0 ${cfg.badge}`}
                  >
                    {cfg.label}
                  </span>
                </div>

                {corr.supportingSignals.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                      Supporting Signals
                    </div>
                    <ul className="space-y-1 text-slate-300 list-disc pl-4 leading-relaxed">
                      {corr.supportingSignals.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {corr.contradictorySignals.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-rose-400">
                      Contradictory Signals
                    </div>
                    <ul className="space-y-1 text-rose-200 list-disc pl-4 leading-relaxed">
                      {corr.contradictorySignals.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {corr.relatedEvidence.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {corr.relatedEvidence.map((ev) => (
                      <span
                        key={ev.id}
                        className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-300"
                      >
                        {ev.modality}: {ev.filename}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between font-mono text-cyan-300">
                    <span>Confidence Range</span>
                    <span>{corr.confidenceRange}</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    <span className="text-slate-500 font-mono">Uncertainty: </span>
                    {corr.uncertaintyNote}
                  </p>
                  {corr.alternativeExplanations.length > 0 && (
                    <p className="text-slate-400 leading-relaxed">
                      <span className="text-slate-500 font-mono">Alternative Explanation: </span>
                      {corr.alternativeExplanations[0]}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
