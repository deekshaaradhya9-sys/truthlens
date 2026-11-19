import React, { useState } from 'react';
import { Volume2, Pause, Play, Square, Highlighter, FileAudio } from 'lucide-react';
import { useI18n } from '../i18n/translations.ts';
import { useSpeech } from '../utils/speechContext.tsx';

export function AudioAccessibilityBar() {
  const { t, language } = useI18n();
  const {
    supported,
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    rate,
    setRate,
    speaking,
    paused,
    speakText,
    pause,
    resume,
    stop,
  } = useSpeech();

  const [notice, setNotice] = useState<string | null>(null);

  if (!supported) return null;

  const langPrefix = language.toLowerCase();
  const matchingVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const displayedVoices = matchingVoices.length > 0 ? matchingVoices : voices.slice(0, 12);

  const handleListenWebsite = () => {
    setNotice(null);
    const intro = `${t.brandTagline}. ${t.landingHeroDesc}`;
    speakText(intro);
  };

  const handleReadPage = () => {
    setNotice(null);
    const mainEl = document.querySelector('main');
    const sourceText = mainEl?.innerText || document.body.innerText || '';
    const condensed = sourceText.replace(/\s+/g, ' ').trim().slice(0, 3200);
    if (condensed) {
      speakText(condensed);
    }
  };

  const handleReadSelected = () => {
    const selection = window.getSelection()?.toString().trim() ?? '';
    if (!selection) {
      setNotice(t.audioNoSelection);
      return;
    }
    setNotice(null);
    speakText(selection);
  };

  return (
    <div className="border-b border-slate-800/80 bg-[#080d1a]/90 backdrop-blur-md px-4 sm:px-6 py-2">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-cyan-300 mr-1">
            <Volume2 className="w-3.5 h-3.5 text-violet-400" />
            <span>{t.audioBarTitle}</span>
          </span>

          <button
            type="button"
            onClick={handleListenWebsite}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-700/80 hover:border-cyan-400 text-slate-200 cursor-pointer"
          >
            <FileAudio className="w-3 h-3 text-cyan-400" />
            <span>{t.audioListenSite}</span>
          </button>

          <button
            type="button"
            onClick={handleReadPage}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-700/80 hover:border-cyan-400 text-slate-200 cursor-pointer"
          >
            <Play className="w-3 h-3 text-emerald-400" />
            <span>{t.audioReadPage}</span>
          </button>

          <button
            type="button"
            onClick={handleReadSelected}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-700/80 hover:border-violet-400 text-slate-200 cursor-pointer"
          >
            <Highlighter className="w-3 h-3 text-violet-400" />
            <span>{t.audioReadSelection}</span>
          </button>

          {speaking && !paused && (
            <button
              type="button"
              onClick={pause}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-200 cursor-pointer"
            >
              <Pause className="w-3 h-3" />
              <span>{t.audioPause}</span>
            </button>
          )}

          {speaking && paused && (
            <button
              type="button"
              onClick={resume}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 cursor-pointer"
            >
              <Play className="w-3 h-3" />
              <span>{t.audioResume}</span>
            </button>
          )}

          {speaking && (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-200 cursor-pointer"
            >
              <Square className="w-3 h-3" />
              <span>{t.audioStop}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
          {displayedVoices.length > 0 && (
            <label className="inline-flex items-center gap-1.5">
              <span>{t.audioVoiceLabel}:</span>
              <select
                value={selectedVoiceURI}
                onChange={(e) => setSelectedVoiceURI(e.target.value)}
                aria-label={t.audioVoiceLabel}
                className="max-w-[160px] px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-200 text-[11px]"
              >
                <option value="">Auto ({language.toUpperCase()})</option>
                {displayedVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="inline-flex items-center gap-1.5">
            <span>{t.audioSpeedLabel}:</span>
            <input
              type="range"
              min="0.75"
              max="1.5"
              step="0.05"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              aria-label={t.audioSpeedLabel}
              className="w-16 accent-cyan-400 cursor-pointer"
            />
            <span className="tabular-nums text-cyan-300">{rate.toFixed(2)}x</span>
          </label>

          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            {speaking ? (paused ? t.audioPaused : t.audioSpeaking) : t.audioReady}
          </span>
        </div>
      </div>

      {notice && (
        <div className="max-w-7xl mx-auto mt-1.5 text-[11px] text-amber-300 font-mono">
          {notice}
        </div>
      )}
    </div>
  );
}
