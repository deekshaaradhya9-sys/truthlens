import React, { useState, useRef } from 'react';
import { Mic, MicOff, Volume2, Square, Send, Scale } from 'lucide-react';
import { apiRequest } from '../utils/api.ts';
import type { AgentMessageItem, ForensicFinding } from '../types/forensics.ts';
import { useI18n } from '../i18n/translations.ts';
import { useSpeech, SPEECH_LANG_TAGS } from '../utils/speechContext.tsx';

interface VoiceAgentPanelProps {
  caseId: string;
  findings: ForensicFinding[];
  initialMessages: AgentMessageItem[];
}

const LANGUAGES = [
  { code: 'en', label: 'English', speechLang: 'en-IN' },
  { code: 'hi', label: 'हिन्दी (Hindi)', speechLang: 'hi-IN' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)', speechLang: 'kn-IN' },
  { code: 'ta', label: 'தமிழ் (Tamil)', speechLang: 'ta-IN' },
  { code: 'te', label: 'తెలుగు (Telugu)', speechLang: 'te-IN' },
] as const;

type LangCode = (typeof LANGUAGES)[number]['code'];

export const VoiceAgentPanel: React.FC<VoiceAgentPanelProps> = ({
  caseId,
  findings,
  initialMessages,
}) => {
  const { t, language: uiLang } = useI18n();
  const { speakText: speakUnified, stop: stopUnified, speaking: unifiedSpeaking } = useSpeech();

  const [messages, setMessages] = useState<AgentMessageItem[]>(
    Array.isArray(initialMessages) ? initialMessages : [],
  );
  const [language, setLanguage] = useState<LangCode>(uiLang);
  const [devilsAdvocate, setDevilsAdvocate] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  React.useEffect(() => {
    setMessages(Array.isArray(initialMessages) ? initialMessages : []);
    setModeNotice(null);
  }, [caseId, initialMessages]);

  React.useEffect(() => {
    if (!unifiedSpeaking) {
      setSpeakingId(null);
    }
  }, [unifiedSpeaking]);

  const handleSpeakMessage = (text: string, msgId: string, langCode: LangCode) => {
    if (!('speechSynthesis' in window)) {
      setError('Browser speechSynthesis is unavailable.');
      return;
    }
    if (speakingId === msgId && unifiedSpeaking) {
      stopUnified();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(msgId);
    speakUnified(text, langCode);
  };

  const askAgent = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || loading) return;
    setError(null);
    setLoading(true);

    const optimisticUser: AgentMessageItem = {
      id: `tmp-u-${Date.now()}`,
      role: 'user',
      language,
      devilsAdvocate,
      content: trimmed,
      citedFindingIds: [],
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setQuestion('');

    try {
      const res = await apiRequest<{
        reply: string;
        citedFindingIds: string[];
        language: LangCode;
        devilsAdvocate: boolean;
        mode?: 'ai' | 'deterministic_fallback';
        notice?: string | null;
      }>(`/api/cases/${caseId}/agent`, {
        method: 'POST',
        body: JSON.stringify({
          question: trimmed,
          language,
          devilsAdvocate,
        }),
      });

      setModeNotice(res.mode === 'deterministic_fallback' ? (res.notice ?? null) : null);

      const assistantMsg: AgentMessageItem = {
        id: `tmp-a-${Date.now()}`,
        role: 'assistant',
        language: res.language,
        devilsAdvocate: res.devilsAdvocate,
        content: res.reply,
        citedFindingIds: Array.isArray(res.citedFindingIds) ? res.citedFindingIds : [],
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      handleSpeakMessage(res.reply, assistantMsg.id, res.language);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Agent request failed.');
    } finally {
      setLoading(false);
    }
  };

  const toggleVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setError('Browser SpeechRecognition is not supported here; please type your question.');
      return;
    }

    const rec = new SpeechRec() as {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang = SPEECH_LANG_TAGS[language] ?? 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const spoken = event.results?.[0]?.[0]?.transcript ?? '';
      if (spoken) {
        setQuestion(spoken);
        askAgent(spoken);
      }
    };
    rec.onerror = () => {
      setListening(false);
      setError('Microphone capture failed or permission denied.');
    };
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  };

  const safeFindings = Array.isArray(findings) ? findings : [];
  const findingById = new Map(safeFindings.map((f) => [f.id, f]));

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{t.agentTitle}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t.agentSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as LangCode)}
            aria-label="Select spoken language"
            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setDevilsAdvocate((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              devilsAdvocate
                ? 'bg-violet-950/60 border-violet-500/70 text-violet-200'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>
              {t.agentDevilsAdvocate}: {devilsAdvocate ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() =>
              askAgent(
                devilsAdvocate
                  ? 'Argue the strongest innocent explanation for each flagged indicator and tell me what extra evidence would settle it.'
                  : 'Narrate a concise briefing of all stored indicators, contradictions, and limitations.',
              )
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 hover:from-cyan-300 hover:to-violet-400 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{t.agentNarrateSummary}</span>
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="text-xs text-slate-400 bg-slate-950/90 border border-slate-800 rounded-lg p-4 leading-relaxed">
              {t.agentSubtitle}
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg p-3.5 border text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-slate-900/70 border-slate-800 text-slate-200 ml-8'
                  : 'bg-slate-950/95 border-cyan-500/20 text-slate-200 mr-4'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5 font-mono text-[11px] text-slate-400">
                <span>
                  {m.role === 'user' ? t.investigatorLabel : 'TruthLens Agent'} · {m.language.toUpperCase()}
                  {m.devilsAdvocate ? ` · ${t.agentDevilsAdvocate}` : ''}
                </span>
                {m.role === 'assistant' && (
                  <button
                    type="button"
                    onClick={() => handleSpeakMessage(m.content, m.id, m.language as LangCode)}
                    className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                  >
                    {speakingId === m.id && unifiedSpeaking ? (
                      <>
                        <Square className="w-3 h-3" />
                        <span>{t.audioStop}</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3 h-3" />
                        <span>Speak</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {(m.citedFindingIds ?? []).length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
                  Cited Indicators:{' '}
                  {(m.citedFindingIds ?? [])
                    .map((id) => findingById.get(id)?.indicator ?? id.slice(0, 8))
                    .join(' · ')}
                </div>
              )}
            </div>
          ))}
        </div>

        {modeNotice && (
          <div className="text-xs text-amber-200 bg-amber-950/35 border border-amber-800/50 rounded-lg px-3 py-2">
            {modeNotice}
          </div>
        )}

        {error && (
          <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            askAgent(question);
          }}
          className="flex items-center gap-2"
        >
          <button
            type="button"
            onClick={toggleVoiceInput}
            aria-label={listening ? 'Stop microphone' : 'Ask by voice'}
            className={`p-2.5 rounded-lg border transition-colors cursor-pointer shrink-0 ${
              listening
                ? 'bg-rose-950/60 border-rose-500 text-rose-300'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-cyan-500'
            }`}
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={listening ? 'Listening...' : t.agentAskPlaceholder}
            className="flex-1 px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />

          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-white text-slate-950 text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{loading ? t.working : t.agentSend}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
