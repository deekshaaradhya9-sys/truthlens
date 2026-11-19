import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Trash2,
  FileImage,
  Film,
  Music,
  FileText,
  Loader2,
  X,
} from 'lucide-react';
import { cleanText, uploadFileWithProgress } from '../utils/api.ts';
import { extractVideoKeyframes } from '../utils/videoFrames.ts';
import type { FullCaseData } from '../types/forensics.ts';

const MAX_BYTES = 15 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.mp4',
  '.webm',
  '.wav',
  '.mp3',
  '.m4a',
  '.ogg',
  '.pdf',
  '.txt',
]);

const ACCEPTED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
  'audio/webm',
  'application/pdf',
  'application/x-pdf',
  'text/plain',
]);

export type QueueItemStatus = 'queued' | 'extracting' | 'uploading' | 'verified' | 'error';

interface UploadQueueItem {
  id: string;
  file: File;
  filename: string;
  sizeBytes: number;
  kind: 'image' | 'video' | 'audio' | 'document' | 'unknown';
  previewUrl: string | null;
  status: QueueItemStatus;
  progress: number;
  errorMessage?: string;
  sha256?: string;
}

interface EvidenceUploaderProps {
  caseId: string;
  titleLabel: string;
  limitLabel: string;
  dropLabel: string;
  acceptedLabel: string;
  onUploaded: (updatedCase: FullCaseData) => void;
  onBusyChange?: (busy: boolean) => void;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function detectFileKind(file: File): UploadQueueItem['kind'] {
  const mime = (file.type || '').split(';')[0].trim().toLowerCase();
  const ext = getFileExtension(file.name);
  if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['.mp4', '.webm'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['.wav', '.mp3', '.m4a', '.ogg'].includes(ext)) return 'audio';
  if (mime === 'application/pdf' || mime === 'application/x-pdf' || mime === 'text/plain' || ['.pdf', '.txt'].includes(ext)) {
    return 'document';
  }
  return 'unknown';
}

function validateCandidateFile(file: File): string | null {
  if (file.size === 0) {
    return 'File is empty (0 bytes). Empty files cannot be ingested.';
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return `File size (${mb} MB) exceeds the strict 15 MB upload limit.`;
  }
  const mime = (file.type || '').split(';')[0].trim().toLowerCase();
  const ext = getFileExtension(file.name);
  const isGenericMime = mime === '' || mime === 'application/octet-stream';

  if (isGenericMime) {
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      return `Unsupported extension "${ext || '(none)'}". Accepted: JPEG, PNG, WebP, MP4, WebM, WAV, MP3, M4A, OGG, PDF, TXT.`;
    }
    return null;
  }

  if (!ACCEPTED_MIMES.has(mime) && !ACCEPTED_EXTENSIONS.has(ext)) {
    return `Unsupported file type "${mime || ext}". Allowed: JPEG, PNG, WebP, MP4, WebM, WAV, MP3, M4A, OGG, PDF, TXT.`;
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const EvidenceUploader: React.FC<EvidenceUploaderProps> = ({
  caseId,
  titleLabel,
  limitLabel,
  dropLabel,
  acceptedLabel,
  onUploaded,
  onBusyChange,
}) => {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const processingRef = useRef(false);

  // Revoke any object URLs on unmount
  useEffect(() => {
    return () => {
      for (const item of queue) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateItem = (id: string, patch: Partial<UploadQueueItem>) => {
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const processItem = async (item: UploadQueueItem) => {
    try {
      const form = new FormData();
      if (item.kind === 'video') {
        updateItem(item.id, { status: 'extracting', progress: 8 });
        const { frames, metadata } = await extractVideoKeyframes(item.file);
        if (frames.length > 0) {
          form.append('framesJson', JSON.stringify(frames));
        }
        form.append('videoMetaJson', JSON.stringify(metadata));
      }
      form.append('file', item.file);

      updateItem(item.id, { status: 'uploading', progress: 15 });
      const res = await uploadFileWithProgress<FullCaseData>(
        `/api/cases/${caseId}/evidence`,
        form,
        (pct) => {
          updateItem(item.id, { progress: Math.max(15, pct) });
        },
      );

      if (!res || !res.uploadedEvidenceId || !res.uploadedSha256) {
        throw new Error('Server did not return a verified custody receipt.');
      }

      updateItem(item.id, {
        status: 'verified',
        progress: 100,
        sha256: res.uploadedSha256,
        errorMessage: undefined,
      });
      onUploaded(res);
    } catch (err) {
      updateItem(item.id, {
        status: 'error',
        progress: 0,
        errorMessage: err instanceof Error ? err.message : 'Upload failed.',
      });
    }
  };

  // Sequential queue runner prevents custody ledger race conditions across multi-file selections
  useEffect(() => {
    const nextQueued = queue.find((item) => item.status === 'queued');
    const anyActive = queue.some(
      (item) => item.status === 'queued' || item.status === 'extracting' || item.status === 'uploading',
    );
    if (onBusyChange) onBusyChange(anyActive);

    if (!nextQueued || processingRef.current) return;

    processingRef.current = true;
    processItem(nextQueued).finally(() => {
      processingRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, caseId]);

  const enqueueFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const created: UploadQueueItem[] = files.map((file) => {
      const validationError = validateCandidateFile(file);
      const kind = detectFileKind(file);
      const previewUrl =
        !validationError && kind === 'image' ? URL.createObjectURL(file) : null;

      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        filename: cleanText(file.name) || 'evidence_file',
        sizeBytes: file.size,
        kind,
        previewUrl,
        status: validationError ? 'error' : 'queued',
        progress: 0,
        errorMessage: validationError ?? undefined,
      };
    });

    setQueue((prev) => [...created, ...prev]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      enqueueFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      enqueueFiles(e.dataTransfer.files);
    }
  };

  const handleRetry = (id: string) => {
    const target = queue.find((it) => it.id === id);
    if (!target) return;
    const validationError = validateCandidateFile(target.file);
    if (validationError) {
      updateItem(id, { status: 'error', errorMessage: validationError });
      return;
    }
    updateItem(id, { status: 'queued', progress: 0, errorMessage: undefined });
  };

  const handleRemove = (id: string) => {
    setQueue((prev) => {
      const victim = prev.find((it) => it.id === id);
      if (victim?.previewUrl) URL.revokeObjectURL(victim.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  const handleClearCompleted = () => {
    setQueue((prev) => {
      for (const it of prev) {
        if (it.status === 'verified' && it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      }
      return prev.filter((it) => it.status !== 'verified');
    });
  };

  const renderKindIcon = (kind: UploadQueueItem['kind']) => {
    if (kind === 'image') return <FileImage className="w-4 h-4 text-cyan-400" />;
    if (kind === 'video') return <Film className="w-4 h-4 text-violet-400" />;
    if (kind === 'audio') return <Music className="w-4 h-4 text-amber-400" />;
    return <FileText className="w-4 h-4 text-emerald-400" />;
  };

  const verifiedCount = queue.filter((q) => q.status === 'verified').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{titleLabel}</h3>
        <span className="text-xs font-mono text-slate-400">{limitLabel}</span>
      </div>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label={dropLabel}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-cyan-400 bg-cyan-950/30 shadow-[0_0_24px_rgba(6,182,212,0.22)]'
            : 'border-slate-700 hover:border-cyan-400 bg-slate-950/80'
        }`}
      >
        <Upload className={`w-5 h-5 ${dragOver ? 'text-cyan-300 scale-110' : 'text-cyan-400'} transition-transform`} />
        <span className="text-xs font-medium text-slate-200">{dropLabel}</span>
        <span className="text-[11px] text-slate-400">
          Drag &amp; drop multiple files here or click to open Chromebook / OS file picker
        </span>
        <span className="text-[11px] font-mono text-slate-500">{acceptedLabel}</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/wav,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,application/pdf,text/plain,.jpg,.jpeg,.png,.webp,.mp4,.webm,.wav,.mp3,.m4a,.ogg,.pdf,.txt"
          onChange={handleInputChange}
          className="sr-only"
        />
      </div>

      {queue.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Upload Queue ({queue.length})</span>
            {verifiedCount > 0 && (
              <button
                type="button"
                onClick={handleClearCompleted}
                className="text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Clear verified ({verifiedCount})
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg border p-2.5 text-xs bg-slate-950/90 ${
                  item.status === 'error'
                    ? 'border-rose-700/70'
                    : item.status === 'verified'
                      ? 'border-emerald-700/60'
                      : 'border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt={item.filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      renderKindIcon(item.kind)
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-100 truncate">{item.filename}</span>
                      <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                        {formatBytes(item.sizeBytes)}
                      </span>
                    </div>

                    {(item.status === 'queued' || item.status === 'extracting' || item.status === 'uploading') && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-150"
                            style={{ width: `${Math.max(6, item.progress)}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-300">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>
                            {item.status === 'queued'
                              ? 'Queued for ingestion...'
                              : item.status === 'extracting'
                                ? 'Sampling video keyframes...'
                                : `Uploading & hashing (${item.progress}%)`}
                          </span>
                        </div>
                      </div>
                    )}

                    {item.status === 'verified' && (
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          Verified &amp; Stored · SHA-256 {item.sha256?.slice(0, 16)}...
                        </span>
                      </div>
                    )}

                    {item.status === 'error' && (
                      <div className="flex items-start gap-1.5 text-[11px] text-rose-300 leading-snug">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{item.errorMessage}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {item.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => handleRetry(item.id)}
                        title="Retry upload"
                        aria-label={`Retry ${item.filename}`}
                        className="p-1.5 rounded-md border border-slate-800 text-cyan-300 hover:border-cyan-500/50 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      title="Remove from queue"
                      aria-label={`Remove ${item.filename}`}
                      className="p-1.5 rounded-md border border-slate-800 text-slate-400 hover:text-rose-300 hover:border-rose-700/60 cursor-pointer"
                    >
                      {item.status === 'verified' ? (
                        <X className="w-3.5 h-3.5" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
