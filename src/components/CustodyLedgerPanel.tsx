import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Link2, Shield } from 'lucide-react';
import { apiRequest } from '../utils/api.ts';
import type {
  AuditLogItem,
  CustodyLedgerEntry,
  LedgerVerificationResult,
} from '../types/forensics.ts';
import { useI18n } from '../i18n/translations.ts';

interface CustodyLedgerPanelProps {
  caseId: string;
  entries: CustodyLedgerEntry[];
  onVerified: (result: LedgerVerificationResult) => void;
}

export const CustodyLedgerPanel: React.FC<CustodyLedgerPanelProps> = ({
  caseId,
  entries,
  onVerified,
}) => {
  const { t } = useI18n();
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<LedgerVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  const loadAuditLogs = async () => {
    try {
      const res = await apiRequest<{ logs: AuditLogItem[] }>('/api/audit-logs');
      setAuditLogs(Array.isArray(res.logs) ? res.logs : []);
    } catch {
      // ignore non-fatal audit fetch error
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [caseId]);

  const handleVerify = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await apiRequest<LedgerVerificationResult>(
        `/api/cases/${caseId}/verify-ledger`,
        { method: 'POST' },
      );
      setResult(res);
      onVerified(res);
      await loadAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const safeEntries = Array.isArray(entries) ? entries : [];

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">{t.ledgerTitle}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{t.ledgerSubtitle}</p>
          </div>

          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{verifying ? t.ledgerVerifying : t.ledgerVerifyBtn}</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {result && (
            <div
              className={`rounded-lg border p-3.5 text-xs flex items-start gap-3 ${
                result.valid
                  ? 'bg-emerald-950/30 border-emerald-700/60 text-emerald-200'
                  : 'bg-rose-950/40 border-rose-700/60 text-rose-200'
              }`}
            >
              {result.valid ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-semibold">
                  {result.valid
                    ? `Ledger Intact · ${result.entriesChecked} blocks & ${result.filesVerified} original files verified`
                    : 'Integrity Mismatch Detected'}
                </div>
                <div className="font-mono text-[11px] opacity-85 break-all">
                  Head Hash: {result.headHash}
                </div>
                {(result.mismatches ?? []).length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-rose-300">
                    {result.mismatches.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {safeEntries.map((entry) => (
              <div
                key={entry.id}
                className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 text-xs font-mono space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-cyan-300 font-semibold tabular-nums">
                    Block #{entry.entryIndex} · {entry.action}
                  </span>
                  <span className="text-slate-500 tabular-nums">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-slate-300 break-all">
                  Artifact SHA-256: <span className="text-slate-400">{entry.fileSha256}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 break-all">
                  <Link2 className="w-3 h-3 shrink-0 text-emerald-500" />
                  <span>
                    prev:{entry.prevEntryHash.slice(0, 12)}... → curr:{entry.entryHash.slice(0, 20)}...
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security Audit Trail */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800/90 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-400" />
            <div>
              <h4 className="text-sm font-semibold text-white">{t.auditLogTitle}</h4>
              <p className="text-[11px] text-slate-400">{t.auditLogSubtitle}</p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {auditLogs.length} events
          </span>
        </div>

        <div className="p-4 space-y-2 max-h-[260px] overflow-y-auto">
          {auditLogs.length === 0 ? (
            <div className="text-xs text-slate-500 font-mono">No audit events recorded yet.</div>
          ) : (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950/85 border border-slate-800/80 text-[11px] font-mono"
              >
                <div className="space-y-0.5">
                  <span className="text-violet-300 font-semibold">{log.action}</span>
                  <span className="text-slate-500"> · {log.resourceType}</span>
                  <div className="text-slate-300 font-sans">{log.details}</div>
                </div>
                <div className="text-right text-slate-500 tabular-nums">
                  <div>ip:{log.ipHash}</div>
                  <div>{new Date(log.createdAt).toLocaleTimeString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
