export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isDemoUser: boolean;
}

export interface CaseSummary {
  id: string;
  title: string;
  description: string;
  isDemoSeed: boolean;
  riskLevel: 'Low' | 'Medium' | 'High';
  confidenceMin: number;
  confidenceMax: number;
  createdAt: number;
  updatedAt: number;
}

export interface VideoFrameSample {
  timestampSec: number;
  deltaScore: number;
  suspicious: boolean;
  thumbnailDataUrl: string;
}

export interface VideoMetadataInfo {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasAudioTrack: boolean | null;
  audioSyncNote: string | null;
  browserDecodeNote?: string | null;
}

export interface SuspiciousImageRegion {
  sector: string;
  meanError: number;
  ratioToMedian: number;
  severity: 'Low' | 'Medium' | 'High';
  note: string;
}

export interface CrossModalCorrelationItem {
  id: string;
  pairKey:
    | 'image_vs_video'
    | 'video_vs_audio'
    | 'audio_vs_transcript'
    | 'caption_vs_visual'
    | 'date_vs_metadata'
    | 'location_vs_context';
  pairLabel: string;
  status: 'supporting' | 'contradictory' | 'inconclusive' | 'insufficient_evidence';
  supportingSignals: string[];
  contradictorySignals: string[];
  relatedEvidence: Array<{ id: string; filename: string; modality: string }>;
  confidenceRange: string;
  uncertaintyNote: string;
  alternativeExplanations: string[];
}

export interface ManipulationIndicatorItem {
  id: string;
  category: 'image_region' | 'video_frame' | 'audio_discontinuity' | 'metadata' | 'text_context';
  severity: 'Low' | 'Medium' | 'High';
  whatDetected: string;
  whereDetected: string;
  timestampOrRegion: string;
  whyFlagged: string;
  supportingEvidence: string;
  innocentExplanation: string;
}

export interface AuditLogItem {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipHash: string;
  details: string;
  createdAt: number;
}

export interface EvidenceExifSummary {
  make: string | null;
  model: string | null;
  software: string | null;
  dateTimeOriginal: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  hasExif: boolean;
  rawTags: Record<string, string | number>;
}

export interface EvidenceItem {
  id: string;
  modality: 'image' | 'video' | 'audio' | 'text' | 'document';
  originalFilename: string;
  hasFile: boolean;
  hasEla: boolean;
  hasFft: boolean;
  mimeType: string;
  byteSize: number;
  sha256: string;
  perceptualHash: string | null;
  exif: EvidenceExifSummary | null;
  metrics: Record<string, unknown> | null;
  frames: VideoFrameSample[] | null;
  transcript: string | null;
  createdAt: number;
}

export interface ForensicFinding {
  id: string;
  caseId: string;
  evidenceId: string | null;
  modality: 'image' | 'video' | 'audio' | 'text' | 'document';
  indicator: string;
  whyFlagged: string;
  locationOrTimestamp: string;
  confidenceRange: string;
  limitation: string;
  severity: 'Low' | 'Medium' | 'High';
  createdAt: number;
}

export interface GraphNodeItem {
  id: string;
  caseId: string;
  nodeKey: string;
  label: string;
  nodeType: 'evidence' | 'claim' | 'metadata';
  modality: string;
  details: string;
}

export interface GraphEdgeItem {
  id: string;
  caseId: string;
  sourceKey: string;
  targetKey: string;
  relation: 'corroborates' | 'contradicts' | 'inconclusive';
  label: string;
  explanation: string;
  confidenceRange: string;
  limitation: string;
}

export interface CustodyLedgerEntry {
  id: string;
  caseId: string;
  entryIndex: number;
  evidenceId: string | null;
  action: string;
  fileSha256: string;
  prevEntryHash: string;
  entryHash: string;
  createdAt: number;
}

export interface LedgerVerificationResult {
  valid: boolean;
  entriesChecked: number;
  filesVerified: number;
  mismatches: string[];
  verifiedAt: number;
  headHash: string;
}

export interface AgentMessageItem {
  id: string;
  role: 'user' | 'assistant';
  language: 'en' | 'hi' | 'kn' | 'ta' | 'te';
  devilsAdvocate: boolean;
  content: string;
  citedFindingIds: string[];
  createdAt: number;
}

export interface HumanReviewRecord {
  status: 'pending' | 'verified_corroborated' | 'verified_inconclusive' | 'escalated';
  reviewerNote: string;
  checkedItems: string[];
  findingDecisions: Record<string, 'corroborated' | 'benign_artifact' | 'needs_followup'>;
  signedOffBy: string | null;
  signedOffAt: number | null;
}

export interface FullCaseData {
  case: {
    id: string;
    title: string;
    description: string;
    captionText: string;
    isDemoSeed: boolean;
    riskLevel: 'Low' | 'Medium' | 'High';
    confidenceMin: number;
    confidenceMax: number;
    summary: string;
    analysisMode?: 'hybrid_ai' | 'deterministic_heuristics';
    analysisStale?: boolean;
    humanReview?: HumanReviewRecord;
    limitations: string[];
    alternativeExplanations: string[];
    recommendedChecks: string[];
    createdAt: number;
    updatedAt: number;
  };
  evidence: EvidenceItem[];
  findings: ForensicFinding[];
  correlations?: CrossModalCorrelationItem[];
  manipulationIndicators?: ManipulationIndicatorItem[];
  graph: {
    nodes: GraphNodeItem[];
    edges: GraphEdgeItem[];
  };
  ledger: CustodyLedgerEntry[];
  agentMessages: AgentMessageItem[];
  uploadedEvidenceId?: string;
  uploadedSha256?: string;
}

export interface CommunityVoteItem {
  id: string;
  voterName: string;
  stance: 'plausible_artifact' | 'needs_corroboration' | 'likely_benign';
  rationale: string;
  createdAt: number;
}

export interface CommunitySummary {
  topicKey: string;
  totalVotes: number;
  counts: {
    plausible_artifact: number;
    needs_corroboration: number;
    likely_benign: number;
  };
  recentVotes: CommunityVoteItem[];
}
