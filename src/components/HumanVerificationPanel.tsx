import React, { useEffect, useState } from 'react';
import { ClipboardCheck, ShieldCheck, CheckSquare, Square } from 'lucide-react';
import { apiRequest } from '../utils/api.ts';
import type { ForensicFinding, FullCaseData, HumanReviewRecord } from '../types/forensics.ts';

interface HumanVerificationPanelProps {
  caseId: string;
  recommendedChecks: string[];
  findings: ForensicFinding[];
  initialReview?: HumanReviewRecord;
  onSaved: (updated: FullCaseData) => void;
}

const STATUS_OPTIONS: Array<{
  value: HumanReviewRecord['status'];
  label: string;
  desc: string;
}> = [
  {
    value: 'pending',
    label: 'Pending Review',
    desc: 'Automated triage recorded; investigator sign-off open.',
  },
  {
    value: 'verified_corroborated',
    label: 'Corroborated Indicators',
    desc: 'Human review verified material cross-modal inconsistencies.',
  },
  {
    value: 'verified_inconclusive',
    label: 'Inconclusive / Benign Likely',
    desc: 'Signals could stem from routine compression or unverified context.',
  },
  {
    value: 'escalated',
    label: 'Escalate to Secondary Lab',
    desc: 'Requires raw camera source files or external provenance check.',
  },
];

const DECISION_LABELS: Record<'corroborated' | 'benign_artifact' | 'needs_followup', string> = {
  corroborated: 'Confirmed Indicator',
  benign_artifact: 'Likely Benign Artifact',
  needs_followup: 'Needs Follow-up',
};

export const HumanVerificationPanel: React.FC<HumanVerificationPanelProps> = ({
  caseId,
  recommendedChecks,
  findings,
  initialReview,
  onSaved,
}) => {
  const safeChecks = Array.isArray(recommendedChecks) ? recommendedChecks : [];
  const safeFindings = Array.isArray(findings) ? findings : [];

  const [status, setStatus] = useState<HumanReviewRecord['status']>(
    initialReview?.status ?? 'pending',
  );
  const [reviewerNote, setReviewerNote] = useState<string>(initialReview?.reviewerNote ?? '');
  const [checkedItems, setCheckedItems] = useState<string[]>(
    Array.isArray(initialReview?.checkedItems) ? initialReview.checkedItems : [],
  );
  const [findingDecisions, setFindingDecisions] = useState<
    Record<string, 'corroborated' | 'benign_artifact' | 'needs_followup'>
  >(initialReview?.findingDecisions ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setStatus(initialReview?.status ?? 'pending');
    setReviewerNote(initialReview?.reviewerNote ?? '');
    setCheckedItems(Array.isArray(initialReview?.checkedItems) ? initialReview.checkedItems : []);
    setFindingDecisions(initialReview?.findingDecisions ?? {});
    setError(null);
    setSavedMsg(null);
  }, [caseId, initialReview]);

  const toggleCheck = (item: string) => {
    setSavedMsg(null);
    setCheckedItems((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    );
  };

  const setDecision = (
    findingId: string,
    decision: 'corroborated' | 'benign_artifact' | 'needs_followup',
  ) => {
    setSavedMsg(null);
    setFindingDecisions((prev) => {
      const next = { ...prev };
      if (next[findingId] === decision) {
        delete next[findingId];
      } else {
        next[findingId] = decision;
      }
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const updated = await apiRequest<FullCaseData>(`/api/cases/${caseId}/human-review`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          reviewerNote,
          checkedItems,
          findingDecisions,
        }),
      });
      onSaved(updated);
      setSavedMsg('Investigator verification & custody ledger digest committed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save human verification.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-panel rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-cyan-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">
              Human Investigator Verification &amp; Sign-Off
            </h3>
            <p className="text-[11px] text-slate-400">
              Audit automated indicators, check off verification steps, and commit investigator sign-off to the immutable SHA-256 ledger.
            </p>
          </div>
        </div>
        {initialReview?.signedOffBy && initialReview?.signedOffAt && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-700/50 text-[11px] font-mono text-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              Signed off by {initialReview.signedOffBy} ·{' '}
              {new Date(initialReview.signedOffAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="p-5 space-y-5 text-xs">
        {safeChecks.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono uppercase tracking-wider text-[11px] text-slate-400">
                Verification Protocol Checklist
              </span>
              <span className="font-mono text-cyan-300 tabular-nums">
                {checkedItems.filter((c) => safeChecks.includes(c)).length} / {safeChecks.length} completed
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {safeChecks.map((chk, idx) => {
                const isChecked = checkedItems.includes(chk);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleCheck(chk)}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      isChecked
                        ? 'bg-emerald-950/25 border-emerald-700/50 text-emerald-100'
                        : 'bg-slate-950/90 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{chk}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {safeFindings.length > 0 && (
          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <span className="block font-mono uppercase tracking-wider text-[11px] text-slate-400">
              Per-Finding Investigator Triage
            </span>
            <div className="space-y-2">
              {safeFindings.map((f) => {
                const current = findingDecisions[f.id];
                return (
                  <div
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-950/90 border border-slate-800"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-200 truncate">{f.indicator}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {f.modality.toUpperCase()} · {f.locationOrTimestamp} · {f.confidenceRange}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        ['corroborated', 'benign_artifact', 'needs_followup'] as const
                      ).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setDecision(f.id, opt)}
                          className={`px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer transition-colors ${
                            current === opt
                              ? opt === 'corroborated'
                                ? 'bg-rose-950/60 border-rose-500/70 text-rose-200'
                                : opt === 'benign_artifact'
                                  ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-200'
                                  : 'bg-amber-950/60 border-amber-500/70 text-amber-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {DECISION_LABELS[opt]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-12 gap-4 pt-2 border-t border-slate-800/80">
          <div className="md:col-span-5 space-y-2">
            <label className="block font-mono uppercase tracking-wider text-[11px] text-slate-400">
              Investigator Determination
            </label>
            <div className="grid gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setStatus(opt.value);
                    setSavedMsg(null);
                  }}
                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-colors ${
                    status === opt.value
                      ? 'bg-gradient-to-r from-cyan-500/15 to-violet-500/15 border-cyan-400 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs">{opt.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-7 flex flex-col justify-between gap-3">
            <div className="space-y-1.5 flex-1 flex flex-col">
              <label className="block font-mono uppercase tracking-wider text-[11px] text-slate-400">
                Investigator Field Notes &amp; Limitations Observed
              </label>
              <textarea
                rows={5}
                maxLength={1500}
                value={reviewerNote}
                onChange={(e) => {
                  setReviewerNote(e.target.value);
                  setSavedMsg(null);
                }}
                placeholder="Document camera original provenance requests, benign explanations ruled in/out, or corroborating OSINT sources..."
                className="flex-1 w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 leading-relaxed"
              />
            </div>

            {error && (
              <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {savedMsg && (
              <div className="text-xs text-emerald-300 bg-emerald-950/35 border border-emerald-800/50 rounded-lg px-3 py-2">
                {savedMsg}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 hover:from-cyan-300 hover:to-violet-400 text-slate-950 text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{saving ? 'Committing Sign-Off...' : 'Commit Sign-Off to Custody Ledger'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
};
