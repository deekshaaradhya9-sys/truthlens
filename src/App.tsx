import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileDown,
  Plus,
  ScanLine,
  AlertTriangle,
  Film,
  LogOut,
  CheckSquare,
  FileText,
  Settings,
  FileCheck2,
  X,
  Download,
} from 'lucide-react';
import {
  apiRequest,
  fetchAuthorizedResponse,
  setCsrfToken,
  setSessionToken,
} from './utils/api.ts';
import { exportForensicReportPdf, type PdfImagePreview } from './utils/pdfReport.ts';
import type {
  AuthUser,
  CaseSummary,
  EvidenceItem,
  FullCaseData,
  LedgerVerificationResult,
} from './types/forensics.ts';
import { useI18n, type UiLanguage } from './i18n/translations.ts';
import { LanguageOnboarding } from './components/LanguageOnboarding.tsx';
import { AudioAccessibilityBar } from './components/AudioAccessibilityBar.tsx';
import { LandingHero } from './components/LandingHero.tsx';
import { RiskGauge } from './components/RiskGauge.tsx';
import { ElaSlider } from './components/ElaSlider.tsx';
import { AudioSpectrogram } from './components/AudioSpectrogram.tsx';
import { ContradictionGraph } from './components/ContradictionGraph.tsx';
import { VoiceAgentPanel } from './components/VoiceAgentPanel.tsx';
import { CustodyLedgerPanel } from './components/CustodyLedgerPanel.tsx';
import { CommunityCalibrationPanel } from './components/CommunityCalibrationPanel.tsx';
import { EvidenceUploader } from './components/EvidenceUploader.tsx';
import { CrossModalCorrelationPanel } from './components/CrossModalCorrelationPanel.tsx';
import { ManipulationIndicatorsPanel } from './components/ManipulationIndicatorsPanel.tsx';
import { HumanVerificationPanel } from './components/HumanVerificationPanel.tsx';

type WorkspaceTab = 'lab' | 'graph' | 'agent' | 'community' | 'ledger';

async function triggerAuthorizedDownload(url: string, filename: string) {
  const res = await fetchAuthorizedResponse(url);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

async function fetchBlobAsDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetchAuthorizedResponse(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

const VideoEvidenceCard: React.FC<{ caseId: string; evidence: EvidenceItem }> = ({
  caseId,
  evidence,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    let objUrl = '';
    if (evidence.hasFile) {
      fetchAuthorizedResponse(`/api/cases/${caseId}/evidence/${evidence.id}/file`)
        .then((res) => res.blob())
        .then((blob) => {
          if (!active) return;
          objUrl = URL.createObjectURL(blob);
          setVideoUrl(objUrl);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [caseId, evidence.id, evidence.hasFile]);

  const jumpToTimestamp = (sec: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, sec);
    el.play().catch(() => {});
  };

  const vm = (evidence.metrics ?? {}) as Record<string, unknown>;
  const vidFrames = Array.isArray(evidence.frames) ? evidence.frames : [];

  return (
    <div className="glass-panel rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">{evidence.originalFilename}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {vidFrames.length} keyframes · Max Δ {String(vm.maxFrameDelta ?? 0)}
            {vm.durationSec ? ` · ${String(vm.durationSec)}s` : ''}
            {vm.width && vm.height ? ` · ${String(vm.width)}×${String(vm.height)}` : ''}
          </span>
          {evidence.hasFile && (
            <button
              type="button"
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  await triggerAuthorizedDownload(
                    `/api/cases/${caseId}/evidence/${evidence.id}/file`,
                    evidence.originalFilename,
                  );
                } finally {
                  setDownloading(false);
                }
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 hover:border-cyan-500 text-[11px] font-medium text-slate-200 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3 h-3 text-cyan-400" />
              <span>{downloading ? 'Saving...' : 'Download Original'}</span>
            </button>
          )}
        </div>
      </div>

      {videoUrl && (
        <div className="rounded-lg overflow-hidden border border-slate-800 bg-black">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            playsInline
            className="w-full max-h-[320px] mx-auto block"
          />
        </div>
      )}

      {Boolean(vm.audioSyncNote || vm.temporalConsistencyNote || vm.creationTimestamp) && (
        <div className="space-y-1.5 text-xs font-mono bg-slate-950/90 border border-cyan-500/20 rounded-lg px-3 py-2.5">
          {Boolean(vm.temporalConsistencyNote) && (
            <div className="text-slate-200">{String(vm.temporalConsistencyNote)}</div>
          )}
          {Boolean(vm.audioSyncNote) && (
            <div className="text-cyan-200">A/V Track Telemetry: {String(vm.audioSyncNote)}</div>
          )}
          {Boolean(vm.creationTimestamp || vm.majorBrand) && (
            <div className="text-slate-400">
              Container: {String(vm.containerFormat ?? 'video').toUpperCase()}
              {vm.majorBrand ? ` (${String(vm.majorBrand)})` : ''}
              {vm.creationTimestamp ? ` · Container Timestamp: ${String(vm.creationTimestamp)}` : ''}
            </div>
          )}
        </div>
      )}

      {vidFrames.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {vidFrames.map((frame, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => jumpToTimestamp(frame.timestampSec)}
              title={
                videoUrl
                  ? `Jump video player to ${frame.timestampSec}s`
                  : `Sampled frame at ${frame.timestampSec}s`
              }
              className={`rounded-lg overflow-hidden border bg-slate-950 text-left transition-transform hover:scale-[1.01] cursor-pointer ${
                frame.suspicious ? 'border-amber-500' : 'border-slate-800 hover:border-cyan-500/50'
              }`}
            >
              <img
                src={frame.thumbnailDataUrl}
                alt={`Video frame at ${frame.timestampSec}s`}
                className="w-full aspect-video object-cover"
              />
              <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono tabular-nums">
                <span className="text-slate-300">{frame.timestampSec}s</span>
                <span
                  className={
                    frame.suspicious ? 'text-amber-300 font-semibold' : 'text-slate-500'
                  }
                >
                  {frame.suspicious ? `Flagged Δ${frame.deltaScore}` : `Δ${frame.deltaScore}`}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-400 bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2">
          Container header verified &amp; hashed; browser frame preview was skipped for this codec stream.
        </div>
      )}
    </div>
  );
};

export default function App() {
  const { t, language, setLanguage, hasConfirmedLanguage } = useI18n();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [casesList, setCasesList] = useState<CaseSummary[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [caseData, setCaseData] = useState<FullCaseData | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('lab');

  const [captionDraft, setCaptionDraft] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [ledgerStatus, setLedgerStatus] = useState<LedgerVerificationResult | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCaption, setNewCaption] = useState('');

  const loadCases = useCallback(async (preferredCaseId?: string) => {
    const res = await apiRequest<{ cases: CaseSummary[] }>('/api/cases');
    const safeCases = Array.isArray(res.cases) ? res.cases : [];
    setCasesList(safeCases);
    const targetId = preferredCaseId || safeCases[0]?.id || null;
    if (targetId) {
      setActiveCaseId(targetId);
      const full = await apiRequest<FullCaseData>(`/api/cases/${targetId}`);
      setCaseData(full);
      setCaptionDraft(full.case?.captionText ?? '');
      setLedgerStatus(null);
    } else {
      setActiveCaseId(null);
      setCaseData(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);

    apiRequest<{ authenticated: boolean; user: AuthUser | null; csrfToken: string | null }>(
      '/api/auth/me',
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (res.authenticated && res.user) {
          setUser(res.user);
          setCsrfToken(res.csrfToken);
          await loadCases();
        }
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timer);
        setAuthChecked(true);
      });

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadCases]);

  const handleAuthenticated = async (
    authedUser: AuthUser,
    csrfToken: string,
    sessionToken?: string,
  ) => {
    setCsrfToken(csrfToken);
    setSessionToken(sessionToken ?? null);
    await loadCases();
    setUser(authedUser);
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // clear local state regardless
    }
    setUser(null);
    setCsrfToken(null);
    setSessionToken(null);
    setCasesList([]);
    setCaseData(null);
    setActiveCaseId(null);
  };

  const handleSelectCase = async (caseId: string) => {
    setActiveCaseId(caseId);
    setStatusError(null);
    setStatusNote(null);
    setLedgerStatus(null);
    try {
      const full = await apiRequest<FullCaseData>(`/api/cases/${caseId}`);
      setCaseData(full);
      setCaptionDraft(full.case?.captionText ?? '');
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to load case.');
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusError(null);
    try {
      const created = await apiRequest<FullCaseData>('/api/cases', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          captionText: newCaption,
        }),
      });
      setShowNewCaseModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewCaption('');
      await loadCases(created.case.id);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to create case.');
    }
  };

  const handleSaveCaption = async () => {
    if (!activeCaseId) return;
    setStatusError(null);
    try {
      const updated = await apiRequest<FullCaseData>(`/api/cases/${activeCaseId}/caption`, {
        method: 'POST',
        body: JSON.stringify({ captionText: captionDraft }),
      });
      setCaseData(updated);
      setStatusNote('Caption claim saved to case bundle.');
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to update caption.');
    }
  };

  const handleAnalyze = async () => {
    if (!activeCaseId) return;
    setAnalyzing(true);
    setStatusError(null);
    setStatusNote(null);
    try {
      const updated = await apiRequest<FullCaseData>(`/api/cases/${activeCaseId}/analyze`, {
        method: 'POST',
      });
      setCaseData(updated);
      setStatusNote('Multimodal forensic analysis completed and committed to custody ledger.');
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Forensic analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!hasConfirmedLanguage) {
    return <LanguageOnboarding />;
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen forensic-grid-bg flex items-center justify-center text-xs font-mono text-cyan-400">
        {t.working}...
      </div>
    );
  }

  if (!user) {
    return <LandingHero onAuthenticated={handleAuthenticated} />;
  }

  const evidenceList = Array.isArray(caseData?.evidence) ? caseData.evidence : [];
  const findingsList = Array.isArray(caseData?.findings) ? caseData.findings : [];
  const limitationsList = Array.isArray(caseData?.case?.limitations) ? caseData.case.limitations : [];
  const alternativesList = Array.isArray(caseData?.case?.alternativeExplanations)
    ? caseData.case.alternativeExplanations
    : [];
  const checksList = Array.isArray(caseData?.case?.recommendedChecks)
    ? caseData.case.recommendedChecks
    : [];
  const correlationsList = Array.isArray(caseData?.correlations) ? caseData.correlations : [];
  const manipulationList = Array.isArray(caseData?.manipulationIndicators)
    ? caseData.manipulationIndicators
    : [];

  const images = evidenceList.filter((e) => e.modality === 'image');
  const videos = evidenceList.filter((e) => e.modality === 'video');
  const audios = evidenceList.filter((e) => e.modality === 'audio');
  const documents = evidenceList.filter((e) => e.modality === 'document');

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'lab', label: t.navLab },
    { id: 'graph', label: t.navGraph },
    { id: 'agent', label: t.navAgent },
    { id: 'community', label: t.navCommunity },
    { id: 'ledger', label: t.navLedger },
  ];

  const handleExportPdf = async () => {
    if (!caseData || exportingPdf) return;
    setExportingPdf(true);
    try {
      const imageItems = (caseData.evidence ?? []).filter((e) => e.modality === 'image');
      const imagePreviews: PdfImagePreview[] = await Promise.all(
        imageItems.slice(0, 4).map(async (img) => ({
          evidenceId: img.id,
          elaDataUrl: img.hasEla
            ? await fetchBlobAsDataUrl(`/api/cases/${caseData.case.id}/evidence/${img.id}/ela`)
            : undefined,
          fftDataUrl: img.hasFft
            ? await fetchBlobAsDataUrl(`/api/cases/${caseData.case.id}/evidence/${img.id}/fft`)
            : undefined,
        })),
      );
      exportForensicReportPdf(caseData, ledgerStatus, { imagePreviews });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="min-h-screen forensic-grid-bg text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#050814]/92 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-tr from-cyan-400 to-violet-500 shadow-[0_0_12px_rgba(6,182,212,0.85)]" />
            <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
              TruthLens
            </span>
          </div>

          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer pb-0.5 border-b-2 ${
                  activeTab === tab.id
                    ? 'text-cyan-300 border-cyan-400'
                    : 'text-slate-400 border-transparent hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowNewCaseModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 hover:from-cyan-300 hover:to-violet-400 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.btnNewCase}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              title={t.btnSettings}
              aria-label={t.btnSettings}
              className="p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title={t.btnSignOut}
              aria-label={t.btnSignOut}
              className="p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-700 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tablet/Mobile Tab Strip */}
        <div className="lg:hidden border-t border-slate-800/80 px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-cyan-500/25 to-violet-500/25 text-cyan-200 border border-cyan-500/30'
                  : 'text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <AudioAccessibilityBar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Case Context & Action Toolbar */}
        <section className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="space-y-1 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
              <span>
                {t.investigatorLabel}: {user.displayName}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-cyan-400">{t.goldenRuleShort}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={activeCaseId ?? ''}
                onChange={(e) => handleSelectCase(e.target.value)}
                aria-label="Select forensic case"
                className="px-3 py-1.5 rounded-lg bg-[#0B1120] border border-slate-800 text-sm font-semibold text-white focus:outline-none focus:border-cyan-500 max-w-full cursor-pointer"
              >
                {casesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {caseData && (
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500 text-xs font-medium text-slate-100 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                <span>{exportingPdf ? t.working : t.btnExportPdf}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing || !caseData}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>{analyzing ? t.btnScanning : t.btnRunAnalysis}</span>
            </button>
          </div>
        </section>

        {/* Scanning Beam Overlay during Analysis / Upload */}
        <AnimatePresence>
          {(analyzing || uploading) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative overflow-hidden glass-panel rounded-xl border-cyan-500/40 px-5 py-4"
            >
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400 to-violet-500 shadow-[0_0_16px_rgba(6,182,212,0.9)] scan-beam" />
              <div className="flex items-center justify-between gap-4 text-xs font-mono text-cyan-300">
                <span>{uploading ? t.scanningUpload : t.scanningAnalyze}</span>
                <span>{t.working}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {statusError && (
          <div className="rounded-lg border border-rose-800/60 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
            {statusError}
          </div>
        )}

        {statusNote && (
          <div className="rounded-lg border border-cyan-800/60 bg-cyan-950/30 px-4 py-3 text-xs text-cyan-200">
            {statusNote}
          </div>
        )}

        {caseData?.case?.analysisStale && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Evidence or caption text has changed since the last synthesis. Re-run Multimodal Analysis to refresh AI findings and the Contradiction Graph.
              </span>
            </div>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold cursor-pointer disabled:opacity-60"
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>{analyzing ? t.btnScanning : 'Refresh Synthesis'}</span>
            </button>
          </div>
        )}

        {caseData && (
          <>
            {/* Top Telemetry Summary Row */}
            <section className="grid lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-4 glass-panel rounded-xl p-5 flex flex-col justify-between">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  {t.calibratedRiskTitle}
                </div>
                <RiskGauge
                  riskLevel={caseData.case.riskLevel}
                  confidenceMin={caseData.case.confidenceMin}
                  confidenceMax={caseData.case.confidenceMax}
                />
                <div className="text-[11px] text-slate-400 text-center border-t border-slate-800/80 pt-3">
                  {t.calibratedRiskFootnote}
                </div>
              </div>

              <div className="lg:col-span-8 glass-panel rounded-xl p-5 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
                    {t.caseSummaryTitle}
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">{caseData.case.summary}</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-slate-800/80 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{t.limitationsTitle}</span>
                    </div>
                    <ul className="space-y-1 text-slate-400 leading-relaxed list-disc pl-4">
                      {limitationsList.slice(0, 3).map((lim, i) => (
                        <li key={i}>{lim}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>{t.alternativesTitle}</span>
                    </div>
                    <ul className="space-y-1 text-slate-400 leading-relaxed list-disc pl-4">
                      {alternativesList.slice(0, 3).map((alt, i) => (
                        <li key={i}>{alt}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Tab Views with Smooth Transition */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'lab' && (
                  <div className="space-y-8">
                    {/* Ingest Strip: Media + Document Upload + Caption Claim */}
                    <section className="grid lg:grid-cols-12 gap-6">
                      <div className="lg:col-span-5 glass-panel rounded-xl p-5 space-y-4">
                        <EvidenceUploader
                          key={caseData.case.id}
                          caseId={caseData.case.id}
                          titleLabel={t.ingestTitle}
                          limitLabel={t.ingestLimit}
                          dropLabel={t.ingestDropLabel}
                          acceptedLabel={t.ingestAccepted}
                          onBusyChange={setUploading}
                          onUploaded={(updated) => {
                            setCaseData(updated);
                            setStatusError(null);
                            if (updated.uploadedSha256) {
                              setStatusNote(
                                `Verified & stored artifact in immutable custody ledger (SHA-256 ${updated.uploadedSha256.slice(0, 14)}...).`,
                              );
                            }
                          }}
                        />
                        <div className="text-xs font-mono text-slate-400">
                          {t.loadedArtifacts}: {images.length} Image · {videos.length} Video ·{' '}
                          {audios.length} Audio · {documents.length} Doc
                        </div>
                      </div>

                      <div className="lg:col-span-7 glass-panel rounded-xl p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-violet-400" />
                            <h3 className="text-sm font-semibold text-white">{t.captionTitle}</h3>
                          </div>
                          <button
                            type="button"
                            onClick={handleSaveCaption}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500 text-xs font-medium text-slate-200 cursor-pointer"
                          >
                            {t.captionSave}
                          </button>
                        </div>
                        <textarea
                          rows={4}
                          value={captionDraft}
                          onChange={(e) => setCaptionDraft(e.target.value)}
                          placeholder={t.captionPlaceholder}
                          className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 leading-relaxed"
                        />
                      </div>
                    </section>

                    {/* Image Forensics (ELA Slider + FFT + EXIF) */}
                    {images.length > 0 && (
                      <section className="space-y-4">
                        <h3 className="font-display text-base font-semibold text-white">
                          {t.imageSectionTitle}
                        </h3>
                        <div className="grid gap-6">
                          {images.map((img) => (
                            <ElaSlider key={img.id} caseId={caseData.case.id} evidence={img} />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Video 8-Frame & A/V Sync Inspection */}
                    {videos.length > 0 && (
                      <section className="space-y-4">
                        <h3 className="font-display text-base font-semibold text-white">
                          {t.videoSectionTitle}
                        </h3>
                        {videos.map((vid) => (
                          <VideoEvidenceCard
                            key={vid.id}
                            caseId={caseData.case.id}
                            evidence={vid}
                          />
                        ))}
                      </section>
                    )}

                    {/* Audio Waveform + Spectrogram */}
                    {audios.length > 0 && (
                      <section className="space-y-4">
                        <h3 className="font-display text-base font-semibold text-white">
                          {t.audioSectionTitle}
                        </h3>
                        <div className="grid gap-6">
                          {audios.map((aud) => (
                            <AudioSpectrogram key={aud.id} caseId={caseData.case.id} evidence={aud} />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Document Forensics (PDF & Plain Text) */}
                    {documents.length > 0 && (
                      <section className="space-y-4">
                        <h3 className="font-display text-base font-semibold text-white">
                          {t.documentSectionTitle}
                        </h3>
                        <div className="grid gap-4">
                          {documents.map((doc) => {
                            const dm = (doc.metrics ?? {}) as Record<string, unknown>;
                            return (
                              <div key={doc.id} className="glass-panel rounded-xl p-5 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <FileCheck2 className="w-4 h-4 text-violet-400" />
                                    <span className="text-sm font-semibold text-white">
                                      {doc.originalFilename}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs font-mono text-slate-400">
                                      {doc.mimeType} · SHA-256 {doc.sha256.slice(0, 12)}...
                                    </span>
                                    {doc.hasFile && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          triggerAuthorizedDownload(
                                            `/api/cases/${caseData.case.id}/evidence/${doc.id}/file`,
                                            doc.originalFilename,
                                          )
                                        }
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 hover:border-cyan-500 text-[11px] font-medium text-slate-200 cursor-pointer"
                                      >
                                        <Download className="w-3 h-3 text-cyan-400" />
                                        <span>Download Original</span>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                                  <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800">
                                    <div className="text-slate-500">Format / Pages</div>
                                    <div className="text-cyan-300 mt-0.5">
                                      {dm.pdfVersion
                                        ? `PDF v${String(dm.pdfVersion)}`
                                        : String(dm.documentType ?? 'text').toUpperCase()}{' '}
                                      {dm.estimatedPages ? `· ${String(dm.estimatedPages)}p` : ''}
                                    </div>
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800">
                                    <div className="text-slate-500">Creator / Producer</div>
                                    <div className="text-slate-200 mt-0.5 truncate">
                                      {String(dm.creator || dm.producer || 'Not recorded')}
                                    </div>
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800">
                                    <div className="text-slate-500">Incremental %%EOF</div>
                                    <div
                                      className={`mt-0.5 ${
                                        Number(dm.incrementalUpdatesCount ?? 0) > 0
                                          ? 'text-amber-300'
                                          : 'text-emerald-300'
                                      }`}
                                    >
                                      {String(dm.incrementalUpdatesCount ?? 0)} revision(s)
                                    </div>
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-slate-950/90 border border-slate-800">
                                    <div className="text-slate-500">Embedded Scripts</div>
                                    <div
                                      className={`mt-0.5 ${
                                        Boolean(dm.hasEmbeddedScripts)
                                          ? 'text-rose-400 font-semibold'
                                          : 'text-emerald-300'
                                      }`}
                                    >
                                      {Boolean(dm.hasEmbeddedScripts) ? 'JS / Action Flagged' : 'None Detected'}
                                    </div>
                                  </div>
                                </div>

                                {Boolean(doc.transcript || dm.extractedExcerpt) && (
                                  <div className="text-xs text-slate-300 bg-slate-950/90 border border-slate-800 rounded-lg p-3 leading-relaxed">
                                    <span className="font-mono text-slate-500 block mb-1">
                                      Extracted Document Context Excerpt
                                    </span>
                                    {String(doc.transcript || dm.extractedExcerpt)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* Explainable Findings Register */}
                    <section className="glass-panel rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white">{t.findingsTitle}</h3>
                        <span className="text-xs font-mono text-slate-400 tabular-nums">
                          {findingsList.length} {t.recordedIndicators}
                        </span>
                      </div>

                      {findingsList.length === 0 ? (
                        <div className="p-6 text-xs text-slate-400">{t.findingsEmpty}</div>
                      ) : (
                        <div className="divide-y divide-slate-800/80">
                          {findingsList.map((f) => (
                            <div key={f.id} className="p-5 grid md:grid-cols-12 gap-4 text-xs">
                              <div className="md:col-span-4 space-y-1">
                                <div className="font-mono uppercase text-[11px] text-slate-400">
                                  <span
                                    className={
                                      f.severity === 'High'
                                        ? 'text-rose-400 font-semibold'
                                        : f.severity === 'Medium'
                                          ? 'text-amber-400 font-semibold'
                                          : 'text-emerald-400 font-semibold'
                                    }
                                  >
                                    {f.severity} Severity
                                  </span>{' '}
                                  · {f.modality}
                                </div>
                                <div className="text-sm font-semibold text-white">{f.indicator}</div>
                                <div className="font-mono text-cyan-300 tabular-nums">
                                  {f.locationOrTimestamp} · {f.confidenceRange}
                                </div>
                              </div>

                              <div className="md:col-span-5 text-slate-300 leading-relaxed">
                                <span className="font-mono text-slate-500 block mb-0.5">
                                  {t.whyFlagged}
                                </span>
                                {f.whyFlagged}
                              </div>

                              <div className="md:col-span-3 text-slate-400 leading-relaxed">
                                <span className="font-mono text-slate-500 block mb-0.5">
                                  {t.limitationLabel}
                                </span>
                                {f.limitation}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Advanced Manipulation Indicators (6-field register) */}
                    <ManipulationIndicatorsPanel indicators={manipulationList} />

                    {/* Human Investigator Verification & Custody Sign-Off */}
                    <HumanVerificationPanel
                      caseId={caseData.case.id}
                      recommendedChecks={checksList}
                      findings={findingsList}
                      initialReview={caseData.case.humanReview}
                      onSaved={(updated) => {
                        setCaseData(updated);
                        setStatusNote('Human investigator verification committed to immutable SHA-256 custody ledger.');
                      }}
                    />
                  </div>
                )}

                {activeTab === 'graph' && (
                  <div className="space-y-6">
                    <CrossModalCorrelationPanel correlations={correlationsList} />
                    <ContradictionGraph
                      nodes={caseData.graph?.nodes ?? []}
                      edges={caseData.graph?.edges ?? []}
                    />
                  </div>
                )}

                {activeTab === 'agent' && (
                  <VoiceAgentPanel
                    caseId={caseData.case.id}
                    findings={findingsList}
                    initialMessages={caseData.agentMessages ?? []}
                  />
                )}

                {activeTab === 'community' && (
                  <CommunityCalibrationPanel
                    topicKey="demo-benchmark-case"
                    caseId={caseData.case.id}
                    caseTitle={caseData.case.title}
                  />
                )}

                {activeTab === 'ledger' && (
                  <CustodyLedgerPanel
                    caseId={caseData.case.id}
                    entries={caseData.ledger ?? []}
                    onVerified={(res) => setLedgerStatus(res)}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </main>

      {/* Settings Modal (Change Language Anytime) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-white">{t.settingsTitle}</h2>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                aria-label={t.closeLabel}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-200">{t.settingsLangLabel}</div>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {t.settingsLangDesc}
                </p>
              </div>
              <div className="grid gap-2">
                {(
                  [
                    { code: 'en', name: 'English', sub: 'English (International)' },
                    { code: 'kn', name: 'ಕನ್ನಡ', sub: 'Kannada' },
                    { code: 'hi', name: 'हिन्दी', sub: 'Hindi' },
                  ] as Array<{ code: UiLanguage; name: string; sub: string }>
                ).map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setLanguage(item.code)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left cursor-pointer transition-colors ${
                      language === item.code
                        ? 'border-cyan-400 bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-semibold text-sm">{item.name}</span>
                    <span className="text-xs font-mono text-slate-400">{item.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                {t.closeLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Case Modal */}
      {showNewCaseModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold text-white">{t.newCaseTitle}</h2>
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1.5">{t.caseTitleLabel}</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={140}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Case TL-2026-09: Coastal Storm Clip Verification"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1.5">{t.caseDescLabel}</label>
                <input
                  type="text"
                  maxLength={600}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Context or source channel..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1.5">{t.caseCaptionLabel}</label>
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="Paste claimed location, date, or speaker transcript..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCaseModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white cursor-pointer"
                >
                  {t.cancelLabel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 hover:from-cyan-300 hover:to-violet-400 text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  {t.createCaseSubmit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
