import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type UiLanguage = 'en' | 'kn' | 'hi';

const STORAGE_KEY = 'tl_lang';

export interface TranslationDict {
  brandTagline: string;
  onboardingEyebrow: string;
  onboardingTitle: string;
  onboardingSubtitle: string;
  onboardingContinue: string;
  onboardingNote: string;
  navLab: string;
  navGraph: string;
  navAgent: string;
  navCommunity: string;
  navLedger: string;
  btnNewCase: string;
  btnSettings: string;
  btnSignOut: string;
  btnExportPdf: string;
  btnRunAnalysis: string;
  btnScanning: string;
  investigatorLabel: string;
  goldenRuleShort: string;
  calibratedRiskTitle: string;
  calibratedRiskFootnote: string;
  caseSummaryTitle: string;
  limitationsTitle: string;
  alternativesTitle: string;
  ingestTitle: string;
  ingestLimit: string;
  ingestDropLabel: string;
  ingestAccepted: string;
  loadedArtifacts: string;
  captionTitle: string;
  captionSave: string;
  captionPlaceholder: string;
  imageSectionTitle: string;
  videoSectionTitle: string;
  audioSectionTitle: string;
  documentSectionTitle: string;
  findingsTitle: string;
  findingsEmpty: string;
  recordedIndicators: string;
  whyFlagged: string;
  limitationLabel: string;
  recommendedChecksTitle: string;
  scanningUpload: string;
  scanningAnalyze: string;
  working: string;
  settingsTitle: string;
  settingsLangLabel: string;
  settingsLangDesc: string;
  closeLabel: string;
  newCaseTitle: string;
  caseTitleLabel: string;
  caseDescLabel: string;
  caseCaptionLabel: string;
  cancelLabel: string;
  createCaseSubmit: string;
  landingHeroDesc: string;
  landingSandboxBtn: string;
  landingOpeningSandbox: string;
  landingSignInTab: string;
  landingSignUpTab: string;
  landingDisplayName: string;
  landingEmail: string;
  landingPassword: string;
  landingSubmitSignIn: string;
  landingSubmitSignUp: string;
  landingPillar1Title: string;
  landingPillar1Desc: string;
  landingPillar2Title: string;
  landingPillar2Desc: string;
  landingPillar3Title: string;
  landingPillar3Desc: string;
  audioBarTitle: string;
  audioListenSite: string;
  audioReadPage: string;
  audioReadSelection: string;
  audioPause: string;
  audioResume: string;
  audioStop: string;
  audioVoiceLabel: string;
  audioSpeedLabel: string;
  audioReady: string;
  audioSpeaking: string;
  audioPaused: string;
  audioNoSelection: string;
  graphHint: string;
  graphCorroborates: string;
  graphContradicts: string;
  graphInconclusive: string;
  graphInspectTitle: string;
  graphInspectPrompt: string;
  agentTitle: string;
  agentSubtitle: string;
  agentDevilsAdvocate: string;
  agentNarrateSummary: string;
  agentAskPlaceholder: string;
  agentSend: string;
  communityTitle: string;
  communitySubtitle: string;
  communityLiveWs: string;
  communityPlaceholder: string;
  communitySubmit: string;
  ledgerTitle: string;
  ledgerSubtitle: string;
  ledgerVerifyBtn: string;
  ledgerVerifying: string;
  auditLogTitle: string;
  auditLogSubtitle: string;
  manipulationTitle: string;
  crossModalTitle: string;
}

const TRANSLATIONS: Record<UiLanguage, TranslationDict> = {
  en: {
    brandTagline: 'TRUTHLENS — SEE BEYOND WHAT YOU SEE.',
    onboardingEyebrow: 'MULTILINGUAL FORENSIC INTERFACE',
    onboardingTitle: 'Choose Your Investigation Language',
    onboardingSubtitle:
      'TruthLens translates all navigation, guidance, and speech accessibility controls while keeping original forensic hashes, EXIF tags, coordinates, and filenames unaltered.',
    onboardingContinue: 'Continue to TruthLens',
    onboardingNote: 'You can change your interface language anytime in Settings.',
    navLab: 'Evidence Lab',
    navGraph: 'Contradiction Graph',
    navAgent: 'Voice Agent',
    navCommunity: 'Community Loop',
    navLedger: 'Custody Ledger',
    btnNewCase: 'New Case',
    btnSettings: 'Settings',
    btnSignOut: 'Sign Out',
    btnExportPdf: 'Export PDF Report',
    btnRunAnalysis: 'Run Multimodal Analysis',
    btnScanning: 'Scanning Modalities...',
    investigatorLabel: 'Investigator',
    goldenRuleShort: 'Indicators, not absolute verdicts',
    calibratedRiskTitle: 'Calibrated Risk Assessment',
    calibratedRiskFootnote: 'Score is an indicator from signal heuristics + AI synthesis, never a binary verdict.',
    caseSummaryTitle: 'Case Executive Summary',
    limitationsTitle: 'Methodological Limitations',
    alternativesTitle: 'Alternative Innocent Explanations',
    ingestTitle: 'Ingest Case Evidence',
    ingestLimit: 'Max 15 MB · Magic-byte verified',
    ingestDropLabel: 'Upload Image, Video, Audio, or Document Evidence',
    ingestAccepted: 'JPEG, PNG, WebP · MP4, WebM · WAV, MP3, M4A, OGG · PDF, TXT',
    loadedArtifacts: 'Loaded Artifacts',
    captionTitle: 'Claimed Caption / Transcript Context',
    captionSave: 'Save Claim Text',
    captionPlaceholder:
      'Paste the social post caption, claimed date/location, or witness transcript to cross-check against media signals...',
    imageSectionTitle: 'Image Signal Analysis (ELA · 2D FFT · EXIF · dHash)',
    videoSectionTitle: 'Video Temporal Keyframe & A/V Sync Inspection (8-Frame Canvas)',
    audioSectionTitle: 'Audio Waveform, Spectrogram & Synthetic-Speech Indicators',
    documentSectionTitle: 'Document Integrity & Metadata Inspection (PDF · TXT)',
    findingsTitle: 'Explainable Forensic Indicators',
    findingsEmpty: 'No indicators generated yet. Upload evidence and click Run Multimodal Analysis.',
    recordedIndicators: 'recorded indicators',
    whyFlagged: 'Why Flagged',
    limitationLabel: 'Limitation',
    recommendedChecksTitle: 'Recommended Human Investigator Checks',
    scanningUpload: 'Ingesting original artifact · verifying magic bytes · computing SHA-256 & signals...',
    scanningAnalyze: 'Running cross-modal Gemini 2.5 Flash synthesis across image, video, audio, documents & claims...',
    working: 'Active Scan',
    settingsTitle: 'Workbench Preferences & Language',
    settingsLangLabel: 'Interface Language',
    settingsLangDesc: 'Switches navigation, prompts, and default speech synthesis locale without modifying stored evidence.',
    closeLabel: 'Close',
    newCaseTitle: 'Create Forensic Case',
    caseTitleLabel: 'Case Title',
    caseDescLabel: 'Brief Description',
    caseCaptionLabel: 'Initial Caption / Claim Text (optional)',
    cancelLabel: 'Cancel',
    createCaseSubmit: 'Create Case',
    landingHeroDesc:
      'Multimodal digital forensics workbench built for explainable verification. Inspect Error Level Analysis, 2D FFT spectra, video keyframe deltas, audio waveforms, PDF metadata, cross-modal contradiction graphs, and SHA-256 custody chains.',
    landingSandboxBtn: 'Launch Isolated Investigator Sandbox',
    landingOpeningSandbox: 'Provisioning Forensic Sandbox...',
    landingSignInTab: 'Investigator Sign In',
    landingSignUpTab: 'Create Account',
    landingDisplayName: 'Investigator Display Name',
    landingEmail: 'Work Email',
    landingPassword: 'Password (min 8 chars)',
    landingSubmitSignIn: 'Sign In to Workbench',
    landingSubmitSignUp: 'Create Investigator Account',
    landingPillar1Title: 'Explainable Signals',
    landingPillar1Desc: 'ELA heatmaps, 2D FFT, dHash, 8-frame video deltas, PCM waveforms & PDF inspection.',
    landingPillar2Title: 'Cross-Modal Graph',
    landingPillar2Desc: 'Interactive contradiction graph connecting claims, metadata anchors, and artifacts.',
    landingPillar3Title: 'Tamper-Evident Custody',
    landingPillar3Desc: 'SHA-256 hash-chained ledger + Web Speech audio accessibility across languages.',
    audioBarTitle: 'Speech Accessibility',
    audioListenSite: 'Listen to Website',
    audioReadPage: 'Read Current Page',
    audioReadSelection: 'Read Selection',
    audioPause: 'Pause',
    audioResume: 'Resume',
    audioStop: 'Stop',
    audioVoiceLabel: 'Voice',
    audioSpeedLabel: 'Speed',
    audioReady: 'Ready',
    audioSpeaking: 'Speaking',
    audioPaused: 'Paused',
    audioNoSelection: 'Highlight any text on the page first, then click Read Selection.',
    graphHint: 'Click any edge to inspect corroborating or contradicting evidence.',
    graphCorroborates: 'Corroborates',
    graphContradicts: 'Contradicts',
    graphInconclusive: 'Inconclusive',
    graphInspectTitle: 'Edge & Node Inspector',
    graphInspectPrompt: 'Select any node or colored link in the contradiction graph to examine its forensic rationale.',
    agentTitle: 'Multilingual Voice Forensic Agent',
    agentSubtitle: 'Strictly grounded in stored case indicators with calibrated risk language.',
    agentDevilsAdvocate: "Devil's Advocate",
    agentNarrateSummary: 'Narrate Case Brief',
    agentAskPlaceholder: 'Ask about timestamps, EXIF mismatches, ELA spikes, or innocent explanations...',
    agentSend: 'Ask',
    communityTitle: 'Real-Time Community Calibration Loop',
    communitySubtitle: 'Public benchmark calibration stream synced over WebSockets.',
    communityLiveWs: 'Live Stream',
    communityPlaceholder: 'Add a concise forensic calibration rationale...',
    communitySubmit: 'Submit Calibration Vote',
    ledgerTitle: 'Tamper-Evident Chain of Custody',
    ledgerSubtitle: 'Originals remain immutable outside web root; every entry hashes the previous SHA-256 record.',
    ledgerVerifyBtn: 'Verify Ledger Integrity',
    ledgerVerifying: 'Verifying SHA-256 Chain...',
    auditLogTitle: 'Investigator Security Audit Trail',
    auditLogSubtitle: 'Recent authenticated security & evidence operations recorded for your account.',
    manipulationTitle: 'Advanced Manipulation Indicators',
    crossModalTitle: 'Cross-Modal Correlation Engine',
  },
  kn: {
    brandTagline: 'TRUTHLENS — ನೀವು ಕಾಣುವುದಕ್ಕಿಂತ ಹೆಚ್ಚಿನದನ್ನು ನೋಡಿ.',
    onboardingEyebrow: 'ಬಹುಭಾಷಾ ಡಿಜಿಟಲ್ ಫೋರೆನ್ಸಿಕ್ ಇಂಟರ್ಫೇಸ್',
    onboardingTitle: 'ನಿಮ್ಮ ತನಿಖಾ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ',
    onboardingSubtitle:
      'TruthLens ಎಲ್ಲಾ ಮೆನುಗಳು, ಸೂಚನೆಗಳು ಮತ್ತು ಧ್ವನಿ ಪ್ರವೇಶ ನಿಯಂತ್ರಣಗಳನ್ನು ಅನುವಾದಿಸುತ್ತದೆ; ಆದರೆ ಮೂಲ ಫೋರೆನ್ಸಿಕ್ ಹ್ಯಾಶ್‌ಗಳು, EXIF ಟ್ಯಾಗ್‌ಗಳು ಮತ್ತು ಫೈಲ್ ಹೆಸರುಗಳನ್ನು ಬದಲಾಯಿಸದೆ ಉಳಿಸುತ್ತದೆ.',
    onboardingContinue: 'TruthLens ಗೆ ಮುಂದುವರಿಯಿರಿ',
    onboardingNote: 'ನೀವು ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಯಾವಾಗ ಬೇಕಾದರೂ ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸಬಹುದು.',
    navLab: 'ಸಾಕ್ಷ್ಯ ಪ್ರಯೋಗಾಲಯ',
    navGraph: 'ವಿರೋಧಾಭಾಸ ಗ್ರಾಫ್',
    navAgent: 'ಧ್ವನಿ ಏಜೆಂಟ್',
    navCommunity: 'ಸಮುದಾಯ ಮೌಲ್ಯಮಾಪನ',
    navLedger: 'ಸುರಕ್ಷಾ ಲೆಡ್ಜರ್',
    btnNewCase: 'ಹೊಸ ಪ್ರಕರಣ',
    btnSettings: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    btnSignOut: 'ಸೈನ್ ಔಟ್',
    btnExportPdf: 'PDF ವರದಿ ರಫ್ತು',
    btnRunAnalysis: 'ಬಹುಮಾಧ್ಯಮ ವಿಶ್ಲೇಷಣೆ ನಡೆಸಿ',
    btnScanning: 'ಮಾದರಿಗಳನ್ನು ಸ್ಕ್ಯಾನ್ ಮಾಡಲಾಗುತ್ತಿದೆ...',
    investigatorLabel: 'ತನಿಖಾಧಿಕಾರಿ',
    goldenRuleShort: 'ಸೂಚಕಗಳು ಮಾತ್ರ, ಅಂತಿಮ ತೀರ್ಪಲ್ಲ',
    calibratedRiskTitle: 'ಅಪಾಯದ ಮಟ್ಟದ ಮೌಲ್ಯಮಾಪನ',
    calibratedRiskFootnote: 'ಅಂಕವು ಸಿಗ್ನಲ್ ವಿಶ್ಲೇಷಣೆ ಮತ್ತು AI ಸಂಯೋಜನೆಯ ಸೂಚಕವಾಗಿದೆ; ಅಂತಿಮ ತೀರ್ಪಲ್ಲ.',
    caseSummaryTitle: 'ಪ್ರಕರಣದ ಕಾರ್ಯನಿರ್ವಾಹಕ ಸಾರಾಂಶ',
    limitationsTitle: 'ವಿಧಾನದ ಮಿತಿಗಳು',
    alternativesTitle: 'ಪರ್ಯಾಯ ನಿರಪರಾಧಿ ವಿವರಣೆಗಳು',
    ingestTitle: 'ಪ್ರಕರಣದ ಸಾಕ್ಷ್ಯ ಅಪ್‌ಲೋಡ್',
    ingestLimit: 'ಗರಿಷ್ಠ 15 MB · ಮ್ಯಾಜಿಕ್-ಬೈಟ್ ಪರಿಶೀಲನೆ',
    ingestDropLabel: 'ಚಿತ್ರ, ವೀಡಿಯೊ, ಆಡಿಯೊ ಅಥವಾ ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
    ingestAccepted: 'JPEG, PNG, WebP · MP4, WebM · WAV, MP3, M4A, OGG · PDF, TXT',
    loadedArtifacts: 'ಲೋಡ್ ಆದ ಸಾಕ್ಷ್ಯಗಳು',
    captionTitle: 'ಹಕ್ಕು ಸಾಧಿಸಿದ ಶೀರ್ಷಿಕೆ / ಪಠ್ಯ ಸಂದರ್ಭ',
    captionSave: 'ಪಠ್ಯವನ್ನು ಉಳಿಸಿ',
    captionPlaceholder: 'ಪರೀಕ್ಷಿಸಲು ಸಾಮಾಜಿಕ ಜಾಲತಾಣದ ಶೀರ್ಷಿಕೆ, ದಿನಾಂಕ/ಸ್ಥಳ ಅಥವಾ ಸಾಕ್ಷಿ ಹೇಳಿಕೆಯನ್ನು ಇಲ್ಲಿ ಅಂಟಿಸಿ...',
    imageSectionTitle: 'ಚಿತ್ರ ಸಿಗ್ನಲ್ ವಿಶ್ಲೇಷಣೆ (ELA · 2D FFT · EXIF · dHash)',
    videoSectionTitle: 'ವೀಡಿಯೊ ಫ್ರೇಮ್ ಮತ್ತು A/V ಸಿಂಕ್ ಪರಿಶೀಲನೆ (8-ಫ್ರೇಮ್)',
    audioSectionTitle: 'ಆಡಿಯೊ ತರಂಗರೂಪ, ಸ್ಪೆಕ್ಟ್ರೋಗ್ರಾಮ್ ಮತ್ತು ಸಿಂಥೆಟಿಕ್ ಧ್ವನಿ ಸೂಚಕಗಳು',
    documentSectionTitle: 'ದಾಖಲೆ ಸಮಗ್ರತೆ ಮತ್ತು ಮೆಟಾಡೇಟಾ ಪರಿಶೀಲನೆ (PDF · TXT)',
    findingsTitle: 'ವಿವರಣಾತ್ಮಕ ಫೋರೆನ್ಸಿಕ್ ಸೂಚಕಗಳು',
    findingsEmpty: 'ಇನ್ನೂ ಸೂಚಕಗಳಿಲ್ಲ. ಸಾಕ್ಷ್ಯವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ವಿಶ್ಲೇಷಣೆಯನ್ನು ಪ್ರಾರಂಭಿಸಿ.',
    recordedIndicators: 'ದಾಖಲಾದ ಸೂಚಕಗಳು',
    whyFlagged: 'ಗುರುತಿಸಲು ಕಾರಣ',
    limitationLabel: 'ಮಿತಿ',
    recommendedChecksTitle: 'ಮಾನವ ತನಿಖಾಧಿಕಾರಿಗೆ ಶಿಫಾರಸು ಮಾಡಿದ ಪರಿಶೀಲನೆಗಳು',
    scanningUpload: 'ಮೂಲ ಸಾಕ್ಷ್ಯವನ್ನು ಪರಿಶೀಲಿಸಿ SHA-256 ಮತ್ತು ಸಿಗ್ನಲ್‌ಗಳನ್ನು ಲೆಕ್ಕಹಾಕಲಾಗುತ್ತಿದೆ...',
    scanningAnalyze: 'ಚಿತ್ರ, ವೀಡಿಯೊ, ಆಡಿಯೊ, ದಾಖಲೆ ಮತ್ತು ಹೇಳಿಕೆಗಳ ಮೇಲೆ Gemini 2.5 Flash ವಿಶ್ಲೇಷಣೆ ನಡೆಯುತ್ತಿದೆ...',
    working: 'ಸ್ಕ್ಯಾನ್ ಪ್ರಗತಿಯಲ್ಲಿದೆ',
    settingsTitle: 'ಕಾರ್ಯಸ್ಥಳದ ಆದ್ಯತೆಗಳು ಮತ್ತು ಭಾಷೆ',
    settingsLangLabel: 'ಇಂಟರ್ಫೇಸ್ ಭಾಷೆ',
    settingsLangDesc: 'ಮೂಲ ಸಾಕ್ಷ್ಯವನ್ನು ಬದಲಾಯಿಸದೆ UI ಮತ್ತು ಧ್ವನಿ ಭಾಷೆಯನ್ನು ಬದಲಾಯಿಸುತ್ತದೆ.',
    closeLabel: 'ಮುಚ್ಚಿ',
    newCaseTitle: 'ಹೊಸ ಫೋರೆನ್ಸಿಕ್ ಪ್ರಕರಣ ರಚಿಸಿ',
    caseTitleLabel: 'ಪ್ರಕರಣದ ಶೀರ್ಷಿಕೆ',
    caseDescLabel: 'ಸಂಕ್ಷಿಪ್ತ ವಿವರಣೆ',
    caseCaptionLabel: 'ಆರಂಭಿಕ ಶೀರ್ಷಿಕೆ / ಹೇಳಿಕೆ (ಐಚ್ಛಿಕ)',
    cancelLabel: 'ರದ್ದುಮಾಡಿ',
    createCaseSubmit: 'ಪ್ರಕರಣ ರಚಿಸಿ',
    landingHeroDesc:
      'ವಿವರಣಾತ್ಮಕ ಡಿಜಿಟಲ್ ಪರಿಶೀಲನೆಗಾಗಿ ನಿರ್ಮಿಸಲಾದ ಬಹುಮಾಧ್ಯಮ ಫೋರೆನ್ಸಿಕ್ ಕಾರ್ಯಸ್ಥಳ. ELA, 2D FFT, ವೀಡಿಯೊ ಫ್ರೇಮ್, ಆಡಿಯೊ ತರಂಗರೂಪ, PDF ಮೆಟಾಡೇಟಾ ಮತ್ತು SHA-256 ಲೆಡ್ಜರ್ ಪರಿಶೀಲಿಸಿ.',
    landingSandboxBtn: 'ಪ್ರತ್ಯೇಕಿತ ತನಿಖಾ ಸ್ಯಾಂಡ್‌ಬಾಕ್ಸ್ ತೆರೆಯಿರಿ',
    landingOpeningSandbox: 'ಸ್ಯಾಂಡ್‌ಬಾಕ್ಸ್ ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ...',
    landingSignInTab: 'ಸೈನ್ ಇನ್',
    landingSignUpTab: 'ಖಾತೆ ರಚಿಸಿ',
    landingDisplayName: 'ತನಿಖಾಧಿಕಾರಿ ಹೆಸರು',
    landingEmail: 'ಇಮೇಲ್ ವಿಳಾಸ',
    landingPassword: 'ಪಾಸ್‌ವರ್ಡ್ (ಕನಿಷ್ಠ 8 ಅಕ್ಷರಗಳು)',
    landingSubmitSignIn: 'ಕಾರ್ಯಸ್ಥಳಕ್ಕೆ ಪ್ರವೇಶಿಸಿ',
    landingSubmitSignUp: 'ಖಾತೆ ನೋಂದಾಯಿಸಿ',
    landingPillar1Title: 'ವಿವರಣಾತ್ಮಕ ಸಿಗ್ನಲ್‌ಗಳು',
    landingPillar1Desc: 'ELA ಹೀಟ್‌ಮ್ಯಾಪ್, 2D FFT, dHash, 8-ಫ್ರೇಮ್ ವೀಡಿಯೊ, ಆಡಿಯೊ ತರಂಗರೂಪ ಮತ್ತು PDF.',
    landingPillar2Title: 'ಕ್ರಾಸ್-ಮೋಡಲ್ ಗ್ರಾಫ್',
    landingPillar2Desc: 'ಹೇಳಿಕೆಗಳು, ಮೆಟಾಡೇಟಾ ಮತ್ತು ಸಾಕ್ಷ್ಯಗಳನ್ನು ಸಂಪರ್ಕಿಸುವ ಪರಸ್ಪರ ವಿರೋಧಾಭಾಸ ಗ್ರಾಫ್.',
    landingPillar3Title: 'ಸುರಕ್ಷಿತ ಕಸ್ಟಡಿ ಲೆಡ್ಜರ್',
    landingPillar3Desc: 'SHA-256 ಹ್ಯಾಶ್-ಚೈನ್ಡ್ ದಾಖಲೆ ಮತ್ತು ಬಹುಭಾಷಾ ಧ್ವನಿ ಪ್ರವೇಶ ಸೌಲಭ್ಯ.',
    audioBarTitle: 'ಧ್ವನಿ ಪ್ರವೇಶ ಸೌಲಭ್ಯ',
    audioListenSite: 'ವೆಬ್‌ಸೈಟ್ ಆಲಿಸಿ',
    audioReadPage: 'ಪ್ರಸ್ತುತ ಪುಟ ಓದಿ',
    audioReadSelection: 'ಆಯ್ದ ಪಠ್ಯ ಓದಿ',
    audioPause: 'ವಿರಾಮ',
    audioResume: 'ಮುಂದುವರಿಸಿ',
    audioStop: 'ನಿಲ್ಲಿಸಿ',
    audioVoiceLabel: 'ಧ್ವನಿ',
    audioSpeedLabel: 'ವೇಗ',
    audioReady: 'ಸಿದ್ಧ',
    audioSpeaking: 'ಓದುತ್ತಿದೆ',
    audioPaused: 'ವಿರಾಮದಲ್ಲಿದೆ',
    audioNoSelection: 'ಮೊದಲು ಪುಟದ ಯಾವುದೇ ಪಠ್ಯವನ್ನು ಆಯ್ಕೆಮಾಡಿ, ನಂತರ ಆಯ್ದ ಪಠ್ಯ ಓದಿ ಒತ್ತಿರಿ.',
    graphHint: 'ಪೋಷಕ ಅಥವಾ ವಿರೋಧಾಭಾಸದ ವಿವರಗಳನ್ನು ನೋಡಲು ಯಾವುದೇ ಲಿಂಕ್ ಮೇಲೆ ಕ್ಲಿಕ್ ಮಾಡಿ.',
    graphCorroborates: 'ಸಮರ್ಥಿಸುತ್ತದೆ',
    graphContradicts: 'ವಿರೋಧಿಸುತ್ತದೆ',
    graphInconclusive: 'ಅನಿರ್ದಿಷ್ಟ',
    graphInspectTitle: 'ಲಿಂಕ್ ಮತ್ತು ನೋಡ್ ಪರಿಶೀಲಕ',
    graphInspectPrompt: 'ಕಾರಣವನ್ನು ಪರಿಶೀಲಿಸಲು ಗ್ರಾಫ್‌ನಲ್ಲಿನ ಯಾವುದೇ ನೋಡ್ ಅಥವಾ ಬಣ್ಣದ ರೇಖೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ.',
    agentTitle: 'ಬಹುಭಾಷಾ ಧ್ವನಿ ಫೋರೆನ್ಸಿಕ್ ಏಜೆಂಟ್',
    agentSubtitle: 'ದಾಖಲಾದ ಪ್ರಕರಣದ ಸೂಚಕಗಳಿಗೆ ಮಾತ್ರ ಸೀಮಿತವಾದ ವಿಶ್ಲೇಷಣೆ.',
    agentDevilsAdvocate: 'ಪ್ರತಿವಾದ ಮೋಡ್',
    agentNarrateSummary: 'ಸಾರಾಂಶ ಓದಿ',
    agentAskPlaceholder: 'ಟೈಮ್‌ಸ್ಟ್ಯಾಂಪ್, EXIF ವ್ಯತ್ಯಾಸ ಅಥವಾ ಪರ್ಯಾಯ ಕಾರಣಗಳ ಬಗ್ಗೆ ಕೇಳಿ...',
    agentSend: 'ಕೇಳಿ',
    communityTitle: 'ನೈಜ-ಸಮಯದ ಸಮುದಾಯ ಮೌಲ್ಯಮಾಪನ',
    communitySubtitle: 'WebSocket ಮೂಲಕ ನವೀಕರಿಸಲಾಗುವ ಸಾರ್ವಜನಿಕ ಮಾನದಂಡ ಮತದಾನ.',
    communityLiveWs: 'ಲೈವ್ ಸ್ಟ್ರೀಮ್',
    communityPlaceholder: 'ಸಂಕ್ಷಿಪ್ತ ಫೋರೆನ್ಸಿಕ್ ಅಭಿಪ್ರಾಯವನ್ನು ಬರೆಯಿರಿ...',
    communitySubmit: 'ಮತ ಸಲ್ಲಿಸಿ',
    ledgerTitle: 'ಬದಲಾಯಿಸಲಾಗದ ಕಸ್ಟಡಿ ಲೆಡ್ಜರ್',
    ledgerSubtitle: 'ಮೂಲ ಫೈಲ್‌ಗಳು ಸುರಕ್ಷಿತವಾಗಿವೆ; ಪ್ರತಿ ನಮೂದು ಹಿಂದಿನ SHA-256 ಹ್ಯಾಶ್ ಅನ್ನು ಒಳಗೊಂಡಿರುತ್ತದೆ.',
    ledgerVerifyBtn: 'ಲೆಡ್ಜರ್ ಸಮಗ್ರತೆ ಪರಿಶೀಲಿಸಿ',
    ledgerVerifying: 'SHA-256 ಸರಪಳಿ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...',
    auditLogTitle: 'ತನಿಖಾಧಿಕಾರಿ ಭದ್ರತಾ ಆಡಿಟ್ ದಾಖಲೆ',
    auditLogSubtitle: 'ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ದಾಖಲಾದ ಇತ್ತೀಚಿನ ಭದ್ರತಾ ಮತ್ತು ಸಾಕ್ಷ್ಯ ಕಾರ್ಯಾಚರಣೆಗಳು.',
    manipulationTitle: 'ಸುಧಾರಿತ ಹಸ್ತಕ್ಷೇಪ ಸೂಚಕಗಳು',
    crossModalTitle: 'ಕ್ರಾಸ್-ಮೋಡಲ್ ಸಹಸಂಬಂಧ ಎಂಜಿನ್',
  },
  hi: {
    brandTagline: 'TRUTHLENS — जो दिखता है उससे परे देखें।',
    onboardingEyebrow: 'बहुभाषी डिजिटल फ़ोरेंसिक इंटरफ़ेस',
    onboardingTitle: 'अपनी जांच भाषा चुनें',
    onboardingSubtitle:
      'TruthLens सभी नेविगेशन, निर्देशों और ऑडियो एक्सेसिबिलिटी नियंत्रणों का अनुवाद करता है, जबकि मूल फ़ोरेंसिक हैश, EXIF टैग, निर्देशांक और फ़ाइल नाम अपरिवर्तित रहते हैं।',
    onboardingContinue: 'TruthLens पर आगे बढ़ें',
    onboardingNote: 'आप सेटिंग्स में जाकर कभी भी भाषा बदल सकते हैं।',
    navLab: 'साक्ष्य प्रयोगशाला',
    navGraph: 'विरोधाभास ग्राफ़',
    navAgent: 'वॉइस एजेंट',
    navCommunity: 'कम्युनिटी लूप',
    navLedger: 'कस्टडी लेजर',
    btnNewCase: 'नया केस',
    btnSettings: 'सेटिंग्स',
    btnSignOut: 'साइन आउट',
    btnExportPdf: 'PDF रिपोर्ट निर्यात',
    btnRunAnalysis: 'मल्टीमॉडल विश्लेषण चलाएं',
    btnScanning: 'मॉडैलिटी स्कैन हो रही है...',
    investigatorLabel: 'जांचकर्ता',
    goldenRuleShort: 'संकेतक मात्र, अंतिम निर्णय नहीं',
    calibratedRiskTitle: 'कैलिब्रेटेड जोखिम मूल्यांकन',
    calibratedRiskFootnote: 'स्कोर सिग्नल और AI संश्लेषण का एक संकेतक है, अंतिम फैसला नहीं।',
    caseSummaryTitle: 'केस कार्यकारी सारांश',
    limitationsTitle: 'पद्धतिगत सीमाएं',
    alternativesTitle: 'वैकल्पिक निर्दोष स्पष्टीकरण',
    ingestTitle: 'केस साक्ष्य अपलोड करें',
    ingestLimit: 'अधिकतम 15 MB · मैजिक-बाइट सत्यापित',
    ingestDropLabel: 'छवि, वीडियो, ऑडियो या दस्तावेज़ साक्ष्य अपलोड करें',
    ingestAccepted: 'JPEG, PNG, WebP · MP4, WebM · WAV, MP3, M4A, OGG · PDF, TXT',
    loadedArtifacts: 'लोड की गई फ़ाइलें',
    captionTitle: 'दावा किया गया कैप्शन / ट्रांसक्रिप्ट संदर्भ',
    captionSave: 'दावा टेक्स्ट सहेजें',
    captionPlaceholder: 'मीडिया संकेतों से क्रॉस-चेक करने के लिए सोशल पोस्ट कैप्शन, दिनांक/स्थान या बयान यहां पेस्ट करें...',
    imageSectionTitle: 'छवि सिग्नल विश्लेषण (ELA · 2D FFT · EXIF · dHash)',
    videoSectionTitle: 'वीडियो कीफ़्रेम और A/V सिंक जांच (8-फ़्रेम कैनवास)',
    audioSectionTitle: 'ऑडियो वेवफ़ॉर्म, स्पेक्ट्रोग्राम और सिंथेटिक-स्पीच संकेतक',
    documentSectionTitle: 'दस्तावेज़ अखंडता और मेटाडेटा निरीक्षण (PDF · TXT)',
    findingsTitle: 'व्याख्यात्मक फ़ोरेंसिक संकेतक',
    findingsEmpty: 'अभी तक कोई संकेतक नहीं है। साक्ष्य अपलोड करें और मल्टीमॉडल विश्लेषण चलाएं।',
    recordedIndicators: 'दर्ज संकेतक',
    whyFlagged: 'क्यों चिह्नित किया गया',
    limitationLabel: 'सीमा',
    recommendedChecksTitle: 'मानव जांचकर्ता के लिए अनुशंसित जांच',
    scanningUpload: 'मूल साक्ष्य सत्यापित किया जा रहा है · मैजिक-बाइट, SHA-256 और सिग्नल की गणना...',
    scanningAnalyze: 'छवि, वीडियो, ऑडियो, दस्तावेज़ और दावों पर Gemini 2.5 Flash विश्लेषण चल रहा है...',
    working: 'सक्रिय स्कैन',
    settingsTitle: 'कार्यक्षेत्र प्राथमिकताएं और भाषा',
    settingsLangLabel: 'इंटरफ़ेस भाषा',
    settingsLangDesc: 'संग्रहीत साक्ष्य को बदले बिना इंटरफ़ेस और वॉइस भाषा बदलता है।',
    closeLabel: 'बंद करें',
    newCaseTitle: 'नया फ़ोरेंसिक केस बनाएं',
    caseTitleLabel: 'केस शीर्षक',
    caseDescLabel: 'संक्षिप्त विवरण',
    caseCaptionLabel: 'प्रारंभिक कैप्शन / दावा टेक्स्ट (वैकल्पिक)',
    cancelLabel: 'रद्द करें',
    createCaseSubmit: 'केस बनाएं',
    landingHeroDesc:
      'व्याख्यात्मक डिजिटल सत्यापन के लिए निर्मित मल्टीमॉडल फ़ोरेंसिक कार्यक्षेत्र। ELA, 2D FFT, वीडियो फ़्रेम डेल्टा, ऑडियो वेवफ़ॉर्म, PDF मेटाडेटा और SHA-256 कस्टडी चेन का विश्लेषण करें।',
    landingSandboxBtn: 'पृथक जांचकर्ता सैंडबॉक्स खोलें',
    landingOpeningSandbox: 'सैंडबॉक्स तैयार हो रहा है...',
    landingSignInTab: 'साइन इन',
    landingSignUpTab: 'खाता बनाएं',
    landingDisplayName: 'जांचकर्ता का नाम',
    landingEmail: 'ईमेल पता',
    landingPassword: 'पासवर्ड (न्यूनतम 8 अक्षर)',
    landingSubmitSignIn: 'कार्यक्षेत्र में प्रवेश करें',
    landingSubmitSignUp: 'खाता पंजीकृत करें',
    landingPillar1Title: 'व्याख्यात्मक सिग्नल',
    landingPillar1Desc: 'ELA हीटमैप, 2D FFT, dHash, 8-फ़्रेम वीडियो, ऑडियो वेवफ़ॉर्म और PDF जांच।',
    landingPillar2Title: 'क्रॉस-मॉडल ग्राफ़',
    landingPillar2Desc: 'दावों, मेटाडेटा एंकर और साक्ष्यों को जोड़ने वाला इंटरैक्टिव विरोधाभास ग्राफ़।',
    landingPillar3Title: 'छेड़छाड़-रोधी कस्टडी',
    landingPillar3Desc: 'SHA-256 हैश-चेन लेजर और बहुभाषी वेब-स्पीच ऑडियो एक्सेसिबिलिटी।',
    audioBarTitle: 'ऑडियो एक्सेसिबिलिटी',
    audioListenSite: 'वेबसाइट सुनें',
    audioReadPage: 'वर्तमान पृष्ठ पढ़ें',
    audioReadSelection: 'चयनित पाठ पढ़ें',
    audioPause: 'रोकें',
    audioResume: 'जारी रखें',
    audioStop: 'बंद करें',
    audioVoiceLabel: 'आवाज़',
    audioSpeedLabel: 'गति',
    audioReady: 'तैयार',
    audioSpeaking: 'बोल रहा है',
    audioPaused: 'रुका हुआ',
    audioNoSelection: 'पहले पृष्ठ पर कोई टेक्स्ट चुनें, फिर चयनित पाठ पढ़ें पर क्लिक करें।',
    graphHint: 'समर्थन या विरोधाभास साक्ष्य देखने के लिए किसी भी लिंक पर क्लिक करें।',
    graphCorroborates: 'पुष्टि करता है',
    graphContradicts: 'विरोधाभास',
    graphInconclusive: 'अनिर्णायक',
    graphInspectTitle: 'लिंक और नोड निरीक्षक',
    graphInspectPrompt: 'फ़ोरेंसिक विवरण देखने के लिए ग्राफ़ में किसी नोड या रंगीन लिंक का चयन करें।',
    agentTitle: 'बहुभाषी वॉइस फ़ोरेंसिक एजेंट',
    agentSubtitle: 'पूरी तरह से संग्रहीत केस संकेतकों और संतुलित जोखिम भाषा पर आधारित।',
    agentDevilsAdvocate: 'प्रतिपक्ष मोड',
    agentNarrateSummary: 'केस सारांश सुनाएं',
    agentAskPlaceholder: 'टाइमस्टैम्प, EXIF विसंगति या निर्दोष कारणों के बारे में पूछें...',
    agentSend: 'पूछें',
    communityTitle: 'रियल-टाइम कम्युनिटी कैलिब्रेशन लूप',
    communitySubtitle: 'WebSocket द्वारा लाइव अपडेट होने वाला सार्वजनिक बेंचमार्क मतदान।',
    communityLiveWs: 'लाइव स्ट्रीम',
    communityPlaceholder: 'संक्षिप्त फ़ोरेंसिक तर्क लिखें...',
    communitySubmit: 'वोट सबमिट करें',
    ledgerTitle: 'छेड़छाड़-रोधी कस्टडी श्रृंखला',
    ledgerSubtitle: 'मूल फ़ाइलें सुरक्षित रहती हैं; प्रत्येक प्रविष्टि पिछले SHA-256 रिकॉर्ड को हैश करती है।',
    ledgerVerifyBtn: 'लेजर अखंडता सत्यापित करें',
    ledgerVerifying: 'SHA-256 श्रृंखला सत्यापित हो रही है...',
    auditLogTitle: 'जांचकर्ता सुरक्षा ऑडिट लॉग',
    auditLogSubtitle: 'आपके खाते के लिए दर्ज हालिया सुरक्षा और साक्ष्य गतिविधियां।',
    manipulationTitle: 'उन्नत हेरफेर संकेतक',
    crossModalTitle: 'क्रॉस-मॉडल सहसंबंध इंजन',
  },
};

interface LanguageContextValue {
  language: UiLanguage;
  hasConfirmedLanguage: boolean;
  setLanguage: (lang: UiLanguage) => void;
  confirmLanguage: (lang: UiLanguage) => void;
  t: TranslationDict;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'kn' || saved === 'hi') return saved;
    } catch {
      // ignore storage failure
    }
    return 'en';
  });

  const [hasConfirmedLanguage, setHasConfirmedLanguage] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === 'en' || saved === 'kn' || saved === 'hi';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: UiLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const confirmLanguage = (lang: UiLanguage) => {
    setLanguageState(lang);
    setHasConfirmedLanguage(true);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const value = useMemo(
    () => ({
      language,
      hasConfirmedLanguage,
      setLanguage,
      confirmLanguage,
      t: TRANSLATIONS[language],
    }),
    [language, hasConfirmedLanguage],
  );

  return React.createElement(LanguageContext.Provider, { value }, children);
}

export function useI18n(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useI18n must be used within LanguageProvider');
  }
  return ctx;
}
