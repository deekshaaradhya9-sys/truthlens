import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, ArrowRight, Eye, Lock, Radio, Globe2 } from 'lucide-react';
import { apiRequest } from '../utils/api.ts';
import type { AuthUser } from '../types/forensics.ts';
import { useI18n, type UiLanguage } from '../i18n/translations.ts';
import { AudioAccessibilityBar } from './AudioAccessibilityBar.tsx';

interface LandingHeroProps {
  onAuthenticated: (user: AuthUser, csrfToken: string, sessionToken?: string) => Promise<void> | void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onAuthenticated }) => {
  const { t, language, setLanguage } = useI18n();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body =
        mode === 'signup' ? { email, password, displayName } : { email, password };
      const res = await apiRequest<{ user: AuthUser; csrfToken: string; sessionToken?: string }>(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
      await onAuthenticated(res.user, res.csrfToken, res.sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchDemo = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      const res = await apiRequest<{ user: AuthUser; csrfToken: string; sessionToken?: string }>(
        '/api/auth/demo',
        {
          method: 'POST',
        },
      );
      await onAuthenticated(res.user, res.csrfToken, res.sessionToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize demo session.');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen forensic-grid-bg text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-800/80 bg-[#050814]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-tr from-cyan-400 to-violet-500 shadow-[0_0_12px_rgba(6,182,212,0.9)]" />
            <span className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap">
              TruthLens
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#evidence-lab" className="hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0">
              {t.navLab}
            </a>
            <a href="#contradiction-graph" className="hover:text-violet-400 transition-colors whitespace-nowrap shrink-0">
              {t.navGraph}
            </a>
            <a href="#voice-agent" className="hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0">
              {t.navAgent}
            </a>
            <a href="#custody-ledger" className="hover:text-violet-400 transition-colors whitespace-nowrap shrink-0">
              {t.navLedger}
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-950/90 text-xs text-slate-300">
              <Globe2 className="w-3.5 h-3.5 text-violet-400" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as UiLanguage)}
                aria-label={t.settingsLangLabel}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="en" className="bg-slate-950">English</option>
                <option value="kn" className="bg-slate-950">ಕನ್ನಡ</option>
                <option value="hi" className="bg-slate-950">हिन्दी</option>
              </select>
            </label>

            <button
              type="button"
              onClick={handleLaunchDemo}
              disabled={demoLoading}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 hover:from-cyan-300 hover:to-violet-400 text-slate-950 transition-all whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer shadow-md shadow-cyan-500/20"
            >
              {demoLoading ? t.landingOpeningSandbox : t.landingSandboxBtn}
            </button>
          </div>
        </div>
      </header>

      <AudioAccessibilityBar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10 lg:py-14 grid lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
        {/* Left Column: Headline, Exact Tagline & Auth Workbench */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="lg:col-span-6 flex flex-col justify-between gap-8"
        >
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 forensic-pulse" />
              <span>{t.brandTagline}</span>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white text-balance leading-[1.08]">
              TRUTHLENS —{' '}
              <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-400 bg-clip-text text-transparent">
                SEE BEYOND WHAT YOU SEE.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
              {t.landingHeroDesc}
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={handleLaunchDemo}
                disabled={demoLoading}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 hover:from-cyan-300 hover:to-violet-400 text-slate-950 font-semibold text-sm transition-all cursor-pointer disabled:opacity-60 shadow-lg shadow-cyan-500/20"
              >
                <span>{demoLoading ? t.landingOpeningSandbox : t.landingSandboxBtn}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 font-mono">
                {t.goldenRuleShort}
              </span>
            </div>
          </div>

          {/* Investigator Auth Panel */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
              <h2 className="font-display text-lg font-semibold text-white">
                {t.investigatorLabel}
              </h2>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950/80 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mode === 'login'
                      ? 'bg-gradient-to-r from-cyan-500/25 to-violet-500/25 text-cyan-200 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.landingSignInTab}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mode === 'signup'
                      ? 'bg-gradient-to-r from-cyan-500/25 to-violet-500/25 text-cyan-200 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.landingSignUpTab}
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.landingDisplayName}
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={60}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Ananya Rao"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950/90 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.landingEmail}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="analyst@newsroom.org"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950/90 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {t.landingPassword}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={mode === 'signup' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Min 8 characters' : '••••••••'}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950/90 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {error && (
                <div className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <span className="text-xs text-slate-400 font-mono">
                  Argon2id · HttpOnly + Partitioned · RBAC
                </span>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-white text-slate-950 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {loading
                    ? t.working
                    : mode === 'signup'
                      ? t.landingSubmitSignUp
                      : t.landingSubmitSignIn}
                </button>
              </div>
            </form>
          </div>
        </motion.section>

        {/* Right Column: Forensic Specimen Preview Card */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="lg:col-span-6 flex flex-col justify-between glass-panel rounded-2xl overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-slate-800/90 flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-slate-300">
              Seeded Case Preview · TL-2026-04
            </span>
            <span className="text-xs font-mono text-amber-300">
              High Indicator · 71%–88%
            </span>
          </div>

          <div className="relative flex-1 min-h-[280px] bg-slate-950 overflow-hidden">
            <img
              src="/src/assets/images/demo_street_evidence_1795075793174.jpg"
              alt="Seeded monsoon street forensic specimen showing MH-02 auto-rickshaw and storefronts"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-90"
            />
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400 via-sky-300 to-violet-400 shadow-[0_0_16px_rgba(6,182,212,0.9)] scan-beam pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050814] via-transparent to-transparent" />
            <div className="absolute bottom-4 inset-x-4 flex flex-col gap-1.5">
              <div className="text-xs font-mono text-cyan-300">
                Caption Claim: Bengaluru MG Road · Nov 18, 2026
              </div>
              <div className="text-xs font-mono text-amber-300">
                EXIF & Signage Anchor: Mumbai GPS 19.0760° N, 72.8777° E · Jul 22, 2023 · MH-02 Plate
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-slate-800/90 grid sm:grid-cols-3 gap-4 text-xs">
            <div id="evidence-lab">
              <div className="flex items-center gap-1.5 text-slate-100 font-semibold mb-1">
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t.landingPillar1Title}</span>
              </div>
              <p className="text-slate-400 leading-relaxed">{t.landingPillar1Desc}</p>
            </div>
            <div id="contradiction-graph">
              <div className="flex items-center gap-1.5 text-slate-100 font-semibold mb-1">
                <Lock className="w-3.5 h-3.5 text-violet-400" />
                <span id="custody-ledger">{t.landingPillar2Title}</span>
              </div>
              <p className="text-slate-400 leading-relaxed">{t.landingPillar2Desc}</p>
            </div>
            <div id="voice-agent">
              <div className="flex items-center gap-1.5 text-slate-100 font-semibold mb-1">
                <Radio className="w-3.5 h-3.5 text-cyan-300" />
                <span>{t.landingPillar3Title}</span>
              </div>
              <p className="text-slate-400 leading-relaxed">{t.landingPillar3Desc}</p>
            </div>
          </div>
        </motion.section>
      </main>

      <footer className="border-t border-slate-900/90 py-4 px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>{t.calibratedRiskFootnote}</span>
          </div>
          <span className="font-mono text-violet-400/90">INNOVEDGE 2026 · PS-04</span>
        </div>
      </footer>
    </div>
  );
};
