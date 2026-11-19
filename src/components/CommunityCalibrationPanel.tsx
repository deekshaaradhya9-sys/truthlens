import React, { useEffect, useState } from 'react';
import { Users, Send } from 'lucide-react';
import { apiRequest } from '../utils/api.ts';
import type { CommunitySummary } from '../types/forensics.ts';
import { useI18n } from '../i18n/translations.ts';

interface CommunityCalibrationPanelProps {
  topicKey?: string;
  caseId?: string;
  caseTitle?: string;
}

export const CommunityCalibrationPanel: React.FC<CommunityCalibrationPanelProps> = ({
  topicKey = 'demo-benchmark-case',
  caseId,
  caseTitle,
}) => {
  const { t } = useI18n();
  const [scope, setScope] = useState<'global' | 'case'>('global');
  const activeTopicKey = scope === 'case' && caseId ? `case-${caseId}` : topicKey;

  const [summary, setSummary] = useState<CommunitySummary | null>(null);
  const [stance, setStance] = useState<'plausible_artifact' | 'needs_corroboration' | 'likely_benign'>('needs_corroboration');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<CommunitySummary>(`/api/community/votes?topicKey=${encodeURIComponent(activeTopicKey)}`)
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch(() => {});

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/community`);
    ws.onopen = () => {
      if (active) setWsConnected(true);
    };
    ws.onclose = () => {
      if (active) setWsConnected(false);
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type: string;
          topicKey: string;
          data: CommunitySummary;
        };
        if (msg.type === 'vote:updated' && msg.topicKey === activeTopicKey && active) {
          setSummary(msg.data);
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      active = false;
      ws.close();
    };
  }, [activeTopicKey]);

  const handleVote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rationale.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await apiRequest<CommunitySummary>('/api/community/votes', {
        method: 'POST',
        body: JSON.stringify({ topicKey: activeTopicKey, stance, rationale }),
      });
      setSummary(updated);
      setRationale('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit calibration vote.');
    } finally {
      setSubmitting(false);
    }
  };

  const total = Math.max(1, summary?.totalVotes ?? 0);
  const pArtifact = Math.round(((summary?.counts?.plausible_artifact ?? 0) / total) * 100);
  const pNeed = Math.round(((summary?.counts?.needs_corroboration ?? 0) / total) * 100);
  const pBenign = Math.round(((summary?.counts?.likely_benign ?? 0) / total) * 100);
  const recentVotes = Array.isArray(summary?.recentVotes) ? summary.recentVotes : [];

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 glass-panel rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">{t.communityTitle}</h3>
          </div>
          <span
            className={`text-xs font-mono ${
              wsConnected ? 'text-emerald-400' : 'text-slate-500'
            }`}
          >
            {wsConnected ? `● ${t.communityLiveWs}` : '○ Reconnecting...'}
          </span>
        </div>

        {caseId && (
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-slate-950/90 border border-slate-800 w-fit">
            <button
              type="button"
              onClick={() => setScope('global')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                scope === 'global'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-200 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Global Benchmark (TL-2026-04)
            </button>
            <button
              type="button"
              onClick={() => setScope('case')}
              className={`px-3 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                scope === 'case'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-cyan-200 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={caseTitle}
            >
              Active Case ({caseId.slice(0, 8)})
            </button>
          </div>
        )}

        <p className="text-xs text-slate-400 leading-relaxed">{t.communitySubtitle}</p>

        {/* Live Consensus Bar */}
        <div className="space-y-2.5">
          <div className="h-3 w-full rounded-full overflow-hidden bg-slate-900 flex">
            <div
              className="bg-rose-500 transition-all duration-300"
              style={{ width: `${pArtifact}%` }}
            />
            <div
              className="bg-amber-400 transition-all duration-300"
              style={{ width: `${pNeed}%` }}
            />
            <div
              className="bg-emerald-500 transition-all duration-300"
              style={{ width: `${pBenign}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
            <div className="text-rose-300">
              Plausible Artifact · {summary?.counts?.plausible_artifact ?? 0} ({pArtifact}%)
            </div>
            <div className="text-amber-300 text-center">
              Needs Corroboration · {summary?.counts?.needs_corroboration ?? 0} ({pNeed}%)
            </div>
            <div className="text-emerald-300 text-right">
              Likely Benign · {summary?.counts?.likely_benign ?? 0} ({pBenign}%)
            </div>
          </div>
        </div>

        {/* Recent Sanitized Peer Votes */}
        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 pt-2 border-t border-slate-800">
          {recentVotes.map((v) => (
            <div
              key={v.id}
              className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 text-xs space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-200">{v.voterName}</span>
                <span
                  className={`font-mono ${
                    v.stance === 'plausible_artifact'
                      ? 'text-rose-400'
                      : v.stance === 'needs_corroboration'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }`}
                >
                  {v.stance.replace('_', ' ')}
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed">{v.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Submit Peer Vote */}
      <form
        onSubmit={handleVote}
        className="lg:col-span-5 glass-panel rounded-xl p-5 space-y-4"
      >
        <h4 className="text-sm font-semibold text-white">{t.communitySubmit}</h4>
        <div className="space-y-2">
          <label className="block text-xs text-slate-400">Assessment Stance</label>
          <div className="grid gap-2">
            {[
              {
                id: 'plausible_artifact',
                title: 'Plausible Artifact / Contradiction',
                desc: 'Indicators point toward meaningful cross-modal mismatch.',
              },
              {
                id: 'needs_corroboration',
                title: 'Needs Human Corroboration',
                desc: 'Signals are ambiguous; external raw source required.',
              },
              {
                id: 'likely_benign',
                title: 'Likely Benign / Recompression',
                desc: 'Anomalies match routine social-media or codec artifacts.',
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStance(opt.id as typeof stance)}
                className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  stance === opt.id
                    ? 'bg-gradient-to-r from-cyan-500/15 to-violet-500/15 border-cyan-400 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">{opt.title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Evidence Rationale</label>
          <textarea
            rows={3}
            required
            minLength={3}
            maxLength={400}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder={t.communityPlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {error && (
          <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !rationale.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 hover:from-cyan-300 hover:to-violet-400 text-slate-950 text-xs font-semibold cursor-pointer disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{submitting ? t.working : t.communitySubmit}</span>
        </button>
      </form>
    </div>
  );
};
