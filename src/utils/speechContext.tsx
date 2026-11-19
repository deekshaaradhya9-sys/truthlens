import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/translations.ts';

export const SPEECH_LANG_TAGS: Record<'en' | 'hi' | 'kn' | 'ta' | 'te', string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  kn: 'kn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
};

interface SpeechContextValue {
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoiceURI: string;
  setSelectedVoiceURI: (uri: string) => void;
  rate: number;
  setRate: (rate: number) => void;
  speaking: boolean;
  paused: boolean;
  speakText: (text: string, langOverride?: 'en' | 'hi' | 'kn' | 'ta' | 'te') => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

const SpeechContext = createContext<SpeechContextValue | null>(null);

export function SpeechProvider({ children }: { children: React.ReactNode }) {
  const { language } = useI18n();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [rate, setRate] = useState<number>(1.0);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!supported) return;
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
    };
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [supported]);

  // Reset selected custom voice when interface language changes so matching locale voice can auto-pick
  useEffect(() => {
    setSelectedVoiceURI('');
  }, [language]);

  const speakText = useCallback(
    (text: string, langOverride?: 'en' | 'hi' | 'kn' | 'ta' | 'te') => {
      if (!supported) return;
      const clean = text.trim();
      if (!clean) return;

      window.speechSynthesis.cancel();
      const targetLang = SPEECH_LANG_TAGS[langOverride ?? language] ?? 'en-IN';
      const prefix = targetLang.split('-')[0].toLowerCase();

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = targetLang;
      utterance.rate = Math.min(1.8, Math.max(0.6, rate));

      const chosen =
        voices.find((v) => v.voiceURI === selectedVoiceURI) ||
        voices.find((v) => v.lang.toLowerCase() === targetLang.toLowerCase()) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
      if (chosen) {
        utterance.voice = chosen;
      }

      utterance.onstart = () => {
        setSpeaking(true);
        setPaused(false);
      };
      utterance.onpause = () => {
        setPaused(true);
      };
      utterance.onresume = () => {
        setPaused(false);
      };
      utterance.onend = () => {
        setSpeaking(false);
        setPaused(false);
      };
      utterance.onerror = () => {
        setSpeaking(false);
        setPaused(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    [supported, language, rate, voices, selectedVoiceURI],
  );

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }, [supported]);

  const value = useMemo(
    () => ({
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
    }),
    [supported, voices, selectedVoiceURI, rate, speaking, paused, speakText, pause, resume, stop],
  );

  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

export function useSpeech(): SpeechContextValue {
  const ctx = useContext(SpeechContext);
  if (!ctx) {
    throw new Error('useSpeech must be used within SpeechProvider');
  }
  return ctx;
}
