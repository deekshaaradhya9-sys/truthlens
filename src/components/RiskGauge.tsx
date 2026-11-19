import React from 'react';
import { motion } from 'motion/react';

interface RiskGaugeProps {
  riskLevel: 'Low' | 'Medium' | 'High';
  confidenceMin: number;
  confidenceMax: number;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  riskLevel,
  confidenceMin,
  confidenceMax,
}) => {
  const radius = 54;
  const circumference = Math.PI * radius; // semicircle
  const clampedMin = Math.max(0, Math.min(100, confidenceMin));
  const clampedMax = Math.max(clampedMin, Math.min(100, confidenceMax));
  const mid = (clampedMin + clampedMax) / 2;
  const strokeOffset = circumference * (1 - mid / 100);

  const colorMap = {
    Low: { stroke: '#10B981', text: 'text-emerald-400', label: 'Low Risk Indicator' },
    Medium: { stroke: '#F59E0B', text: 'text-amber-400', label: 'Medium Risk Indicator' },
    High: { stroke: '#EF4444', text: 'text-rose-400', label: 'High Risk Indicator' },
  } as const;

  const tone = colorMap[riskLevel] ?? colorMap.Medium;

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="relative w-40 h-24 flex items-end justify-center">
        <svg viewBox="0 0 140 80" className="w-full h-full overflow-visible">
          <path
            d="M 16 70 A 54 54 0 0 1 124 70"
            fill="none"
            stroke="rgba(148,163,184,0.16)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <motion.path
            d="M 16 70 A 54 54 0 0 1 124 70"
            fill="none"
            stroke={tone.stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: strokeOffset }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="absolute bottom-1 text-center">
          <div className={`font-mono text-xl font-semibold tabular-nums ${tone.text}`}>
            {clampedMin}%–{clampedMax}%
          </div>
          <div className="text-[11px] font-mono text-slate-400">Calibrated Range</div>
        </div>
      </div>
      <div className={`mt-2 text-xs font-semibold ${tone.text}`}>{tone.label}</div>
    </div>
  );
};
