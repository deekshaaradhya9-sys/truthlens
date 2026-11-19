import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Globe2, ArrowRight, ShieldCheck } from 'lucide-react';
import { useI18n, type UiLanguage } from '../i18n/translations.ts';

const LANGUAGE_CARDS: Array<{
  code: UiLanguage;
  nativeName: string;
  englishName: string;
  scriptBadge: string;
  sampleLine: string;
}> = [
  {
    code: 'en',
    nativeName: 'English',
    englishName: 'English (International)',
    scriptBadge: 'EN-IN',
    sampleLine: 'Explainable multimodal digital forensics & chain-of-custody verification.',
  },
  {
    code: 'kn',
    nativeName: 'ಕನ್ನಡ',
    englishName: 'Kannada',
    scriptBadge: 'KN-IN',
    sampleLine: 'ವಿವರಣಾತ್ಮಕ ಬಹುಮಾಧ್ಯಮ ಡಿಜಿಟಲ್ ಫೋರೆನ್ಸಿಕ್ಸ್ ಮತ್ತು ಕಸ್ಟಡಿ ಪರಿಶೀಲನೆ.',
  },
  {
    code: 'hi',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    scriptBadge: 'HI-IN',
    sampleLine: 'व्याख्यात्मक मल्टीमॉडल डिजिटल फ़ोरेंसिक और कस्टडी सत्यापन।',
  },
];

export function LanguageOnboarding() {
  const { language, confirmLanguage, setLanguage, t } = useI18n();
  const [selected, setSelected] = useState<UiLanguage>(language);

  const handleSelect = (code: UiLanguage) => {
    setSelected(code);
    setLanguage(code);
  };

  return (
    <div className="min-h-screen forensic-grid-bg text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/4 w-96 h-96 rounded-full bg-cyan-500/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 right-1/4 w-96 h-96 rounded-full bg-violet-600/15 blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative z-10 w-full max-w-3xl glass-panel rounded-2xl p-7 sm:p-10 space-y-8"
      >
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-mono tracking-widest uppercase text-cyan-300">
            <Globe2 className="w-4 h-4 text-violet-400" />
            <span>{t.onboardingEyebrow}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
            {t.onboardingTitle}
          </h1>
          <p className="text-xs font-mono tracking-wider text-cyan-400">
            {t.brandTagline}
          </p>
          <p className="text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
            {t.onboardingSubtitle}
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {LANGUAGE_CARDS.map((card) => {
            const active = selected === card.code;
            return (
              <button
                key={card.code}
                type="button"
                onClick={() => handleSelect(card.code)}
                className={`text-left rounded-xl p-5 border transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                  active
                    ? 'border-cyan-400 bg-gradient-to-br from-cyan-500/15 via-slate-900/90 to-violet-500/15 shadow-[0_0_25px_rgba(6,182,212,0.18)]'
                    : 'border-slate-800 bg-slate-950/75 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-2xl font-bold text-white">
                      {card.nativeName}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{card.englishName}</div>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      active
                        ? 'border-cyan-400/50 text-cyan-300 bg-cyan-950/60'
                        : 'border-slate-800 text-slate-500 bg-slate-900'
                    }`}
                  >
                    {card.scriptBadge}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{card.sampleLine}</p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-violet-400 shrink-0" />
            <span>{t.onboardingNote}</span>
          </div>

          <button
            type="button"
            onClick={() => confirmLanguage(selected)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 hover:from-cyan-300 hover:to-violet-400 text-slate-950 font-semibold text-sm shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <span>{t.onboardingContinue}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
