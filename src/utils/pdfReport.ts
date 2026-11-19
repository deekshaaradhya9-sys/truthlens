import { jsPDF } from 'jspdf';
import type { FullCaseData, LedgerVerificationResult } from '../types/forensics.ts';

export interface PdfImagePreview {
  evidenceId: string;
  elaDataUrl?: string;
  fftDataUrl?: string;
}

export interface PdfExportOptions {
  imagePreviews?: PdfImagePreview[];
}

function toPdfSafeText(input: string): string {
  return String(input ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u00B7/g, '|')
    .replace(/\u0394/g, 'Delta ')
    .replace(/\u00D7/g, 'x')
    .replace(/\u00B0/g, ' deg')
    .replace(/\u25A1/g, '[ ]')
    .replace(/[^\x20-\x7E\r\n]/g, '?');
}

export function exportForensicReportPdf(
  data: FullCaseData,
  ledgerStatus: LedgerVerificationResult | null,
  options?: PdfExportOptions,
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = 52;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 48;
    }
  };

  const addSectionTitle = (title: string) => {
    ensureSpace(34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(6, 148, 162);
    doc.text(toPdfSafeText(title.toUpperCase()), margin, y);
    y += 5;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;
  };

  const addParagraph = (
    text: string,
    fontSize = 9,
    color: [number, number, number] = [30, 41, 59],
  ) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(toPdfSafeText(text), maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(13);
      doc.text(line, margin, y);
      y += 12.5;
    }
    y += 4;
  };

  const evidenceList = Array.isArray(data.evidence) ? data.evidence : [];
  const findingsList = Array.isArray(data.findings) ? data.findings : [];
  const correlations = Array.isArray(data.correlations) ? data.correlations : [];
  const manipulationIndicators = Array.isArray(data.manipulationIndicators)
    ? data.manipulationIndicators
    : [];
  const ledger = Array.isArray(data.ledger) ? data.ledger : [];
  const previewMap = new Map((options?.imagePreviews ?? []).map((p) => [p.evidenceId, p]));

  const images = evidenceList.filter((e) => e.modality === 'image');
  const videos = evidenceList.filter((e) => e.modality === 'video');
  const audios = evidenceList.filter((e) => e.modality === 'audio');
  const documents = evidenceList.filter((e) => e.modality === 'document' || e.modality === 'text');

  // Header Banner
  doc.setFillColor(11, 17, 30);
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(248, 250, 252);
  doc.text('TRUTHLENS FORENSIC DOSSIER', margin, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    toPdfSafeText(`See Beyond What You See  |  Generated: ${new Date().toISOString()}`),
    margin,
    56,
  );
  doc.text(
    toPdfSafeText(
      `Case ID: ${data.case.id}  |  Mode: ${data.case.analysisMode ?? 'hybrid_ai'}${data.case.analysisStale ? ' (RE-ANALYSIS PENDING)' : ''}`,
    ),
    margin,
    71,
  );

  y = 110;

  // 01. Case Details
  addSectionTitle('01. Case Details & Calibrated Assessment');
  addParagraph(`Title: ${data.case.title}`, 10, [15, 23, 42]);
  if (data.case.description) addParagraph(`Description: ${data.case.description}`, 9);
  addParagraph(
    `Risk Indicator Level: ${data.case.riskLevel}  |  Calibrated Confidence Range: ${data.case.confidenceMin}% - ${data.case.confidenceMax}%  |  Created: ${new Date(data.case.createdAt).toISOString()}`,
    9.5,
    [180, 83, 9],
  );
  addParagraph(data.case.summary || 'No summary generated yet.');

  // 02. Uploaded Evidence Inventory
  addSectionTitle('02. Uploaded Evidence Inventory');
  if (evidenceList.length === 0) {
    addParagraph('No evidence items uploaded in this case.');
  } else {
    for (const ev of evidenceList) {
      addParagraph(
        `* ${ev.originalFilename}  |  Modality: ${ev.modality.toUpperCase()}  |  MIME: ${ev.mimeType}  |  Size: ${ev.byteSize} bytes  |  Ingested: ${new Date(ev.createdAt).toISOString()}`,
        8.8,
      );
    }
  }

  // 03. Cryptographic SHA-256 Hashes
  addSectionTitle('03. Cryptographic SHA-256 Hashes & Custody Integrity');
  for (const ev of evidenceList) {
    addParagraph(
      `* ${ev.originalFilename}: SHA-256 ${ev.sha256}${ev.perceptualHash ? `  |  dHash: ${ev.perceptualHash}` : ''}`,
      8.4,
    );
  }
  addParagraph(
    ledgerStatus
      ? `Chain Verification: ${ledgerStatus.valid ? 'INTACT & VERIFIED' : 'MISMATCH DETECTED'} (${ledgerStatus.entriesChecked} entries, ${ledgerStatus.filesVerified} files verified, Head Hash: ${ledgerStatus.headHash.slice(0, 28)}...)`
      : `Chain Entries Recorded: ${ledger.length} (Latest Entry Hash: ${ledger[ledger.length - 1]?.entryHash.slice(0, 28) ?? 'N/A'}...)`,
    9,
    ledgerStatus?.valid ? [21, 128, 61] : [51, 65, 85],
  );

  // 04. Source Trace & Metadata Summary
  addSectionTitle('04. Source Trace & Metadata Provenance');
  if (evidenceList.length === 0) {
    addParagraph('No source metadata available.');
  } else {
    for (const ev of evidenceList) {
      const exifStr = ev.exif?.hasExif
        ? `Camera: ${[ev.exif.make, ev.exif.model].filter(Boolean).join(' ') || 'n/a'}, Software: ${ev.exif.software ?? 'none'}, DateTimeOriginal: ${ev.exif.dateTimeOriginal ?? 'n/a'}, GPS: ${ev.exif.gpsLatitude ?? 'n/a'}, ${ev.exif.gpsLongitude ?? 'n/a'}`
        : 'No camera EXIF header present (or non-image artifact).';
      addParagraph(`* ${ev.originalFilename} (${ev.modality}): ${exifStr}`, 8.6);
    }
  }

  // 05. Image Forensic Findings
  addSectionTitle('05. Image Forensic Findings (ELA | 2D FFT | EXIF | Regions)');
  if (images.length === 0) {
    addParagraph('No image artifacts ingested.');
  } else {
    for (const img of images) {
      const m = (img.metrics ?? {}) as Record<string, unknown>;
      const manip = Array.isArray(m.manipulationIndicators) ? (m.manipulationIndicators as string[]) : [];
      const aiInd = Array.isArray(m.aiGenerationIndicators) ? (m.aiGenerationIndicators as string[]) : [];
      addParagraph(
        `${img.originalFilename} (${String(m.width ?? '?')}x${String(m.height ?? '?')}): ELA Mean=${String(m.elaMean ?? 'n/a')}, Max=${String(m.elaMax ?? 'n/a')}, Variance=${String(m.blockVarianceRatio ?? 'n/a')}x (${String(m.hotspotSector ?? 'n/a')}), FFT Peak=${String(m.fftPeriodicPeakScore ?? 'n/a')}%\nManipulation: ${manip.join('; ') || 'None'}\nAI/FFT: ${aiInd.join('; ') || 'None'}`,
        8.6,
      );

      const preview = previewMap.get(img.id);
      if (preview?.elaDataUrl || preview?.fftDataUrl) {
        ensureSpace(135);
        const startY = y;
        let drew = false;
        try {
          if (preview.elaDataUrl) {
            doc.addImage(preview.elaDataUrl, 'PNG', margin, startY, 175, 110);
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('Error Level Analysis Heatmap (PNG)', margin, startY + 120);
            drew = true;
          }
          if (preview.fftDataUrl) {
            const xOffset = preview.elaDataUrl ? margin + 195 : margin;
            doc.addImage(preview.fftDataUrl, 'PNG', xOffset, startY, 110, 110);
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('2D FFT Spectrum', xOffset, startY + 120);
            drew = true;
          }
        } catch {
          // ignore invalid image data URLs gracefully
        }
        if (drew) {
          y = startY + 134;
        }
      }
    }
  }

  // 06. Video Forensic Findings & Flagged Timestamps
  addSectionTitle('06. Video Forensic Findings & Flagged Timestamps');
  if (videos.length === 0) {
    addParagraph('No video artifacts ingested.');
  } else {
    for (const vid of videos) {
      const vm = (vid.metrics ?? {}) as Record<string, unknown>;
      const frames = Array.isArray(vid.frames) ? vid.frames : [];
      const flagged = frames.filter((f) => f.suspicious);
      addParagraph(
        `${vid.originalFilename}: Container=${String(vm.containerFormat ?? 'video')}, Duration=${String(vm.durationSec ?? '?')}s, Resolution=${String(vm.width ?? '?')}x${String(vm.height ?? '?')}, Sampled=${frames.length}, Flagged=${flagged.length} (${flagged.map((f) => `${f.timestampSec}s Delta ${f.deltaScore}`).join(', ') || 'none'})\nA/V Track Note: ${String(vm.audioSyncNote ?? 'n/a')}`,
        8.6,
      );
    }
  }

  // 07. Audio Forensic Findings & Flagged Segments
  addSectionTitle('07. Audio Forensic Findings & Flagged Segments');
  if (audios.length === 0) {
    addParagraph('No audio artifacts ingested.');
  } else {
    for (const aud of audios) {
      const am = (aud.metrics ?? {}) as Record<string, unknown>;
      const windows = Array.isArray(am.discontinuityWindows)
        ? (am.discontinuityWindows as Array<{ startSec: number; endSec: number; deltaDb: number; note: string }>)
        : [];
      const synth = Array.isArray(am.syntheticSpeechIndicators)
        ? (am.syntheticSpeechIndicators as string[])
        : [];
      addParagraph(
        `${aud.originalFilename}: SampleRate=${String(am.sampleRate ?? '?')}Hz, Bitrate=${String(am.bitrateKbps ?? '?')}kbps, Duration=${String(am.durationSec ?? '?')}s, RMS=${String(am.rmsDb ?? '?')}dB\nFlagged Segments: ${windows.map((w) => `${w.startSec}s-${w.endSec}s (Delta ${w.deltaDb}dB: ${w.note})`).join('; ') || 'None'}\nSynthetic Markers: ${synth.join('; ') || 'None'}${aud.transcript ? `\nTranscript/Notes: ${aud.transcript}` : ''}`,
        8.6,
      );
    }
  }

  // 08. Text, Transcript & Document Context Findings
  addSectionTitle('08. Text, Transcript & Document Context Findings');
  if (data.case.captionText) {
    addParagraph(`Submitted Case Claim / Caption: "${data.case.captionText}"`, 9);
  }
  for (const d of documents) {
    const dm = (d.metrics ?? {}) as Record<string, unknown>;
    addParagraph(
      `${d.originalFilename} (${d.mimeType}): Type=${String(dm.documentType ?? d.modality)}, Incremental Updates=${String(dm.incrementalUpdatesCount ?? 0)}, Embedded Scripts=${Boolean(dm.hasEmbeddedScripts)}\nExcerpt: ${d.transcript || String(dm.extractedExcerpt ?? 'n/a')}`,
      8.5,
    );
  }
  if (!data.case.captionText && documents.length === 0) {
    addParagraph('No caption text or document artifacts provided.');
  }

  // 09. Cross-Modal Correlation Results
  addSectionTitle('09. Cross-Modal Correlation Results');
  if (correlations.length === 0 && (data.graph?.edges ?? []).length === 0) {
    addParagraph('No cross-modal correlations recorded yet.');
  } else {
    for (const c of correlations) {
      addParagraph(
        `[${c.status.toUpperCase()}] ${c.pairLabel} (Confidence: ${c.confidenceRange})\nSupporting: ${c.supportingSignals.join('; ') || 'None'}\nContradicting: ${c.contradictorySignals.join('; ') || 'None'}\nUncertainty: ${c.uncertaintyNote}`,
        8.6,
      );
    }
    for (const edge of data.graph?.edges ?? []) {
      addParagraph(
        `Graph Edge [${edge.relation.toUpperCase()}] ${edge.sourceKey} -> ${edge.targetKey} (${edge.label} | ${edge.confidenceRange}): ${edge.explanation}`,
        8.4,
      );
    }
  }

  // 10. Advanced Manipulation Indicators
  addSectionTitle('10. Advanced Manipulation Indicators');
  if (manipulationIndicators.length === 0 && findingsList.length === 0) {
    addParagraph('No structured manipulation indicators flagged.');
  } else {
    for (const ind of manipulationIndicators) {
      addParagraph(
        `[${ind.severity.toUpperCase()} | ${ind.category}] ${ind.whatDetected}\nWhere: ${ind.whereDetected} | Timestamp/Region: ${ind.timestampOrRegion}\nWhy Flagged: ${ind.whyFlagged}\nSupporting Telemetry: ${ind.supportingEvidence}\nPossible Innocent Explanation: ${ind.innocentExplanation}`,
        8.5,
      );
    }
  }

  // 11. Confidence, Uncertainty & Limitations
  addSectionTitle('11. Confidence, Uncertainty & Methodological Limitations');
  addParagraph(
    `Overall Risk Level: ${data.case.riskLevel} (Calibrated Range: ${data.case.confidenceMin}% - ${data.case.confidenceMax}%). Scores represent probabilistic indicators and NEVER serve as binary proof.`,
    9,
  );
  for (const lim of data.case.limitations ?? []) {
    addParagraph(`* Limitation: ${lim}`, 8.8, [100, 116, 139]);
  }

  // 12. Alternative Innocent Explanations
  addSectionTitle('12. Alternative Innocent Explanations');
  for (const alt of data.case.alternativeExplanations ?? []) {
    addParagraph(`* ${alt}`, 8.8);
  }

  // 13. Analysis History & Custody Timeline
  addSectionTitle('13. Analysis History & Custody Timeline');
  if (ledger.length === 0) {
    addParagraph('No custody ledger entries recorded.');
  } else {
    for (const entry of ledger) {
      addParagraph(
        `#${entry.entryIndex} [${new Date(entry.createdAt).toISOString()}] ${entry.action}  |  Digest: ${entry.fileSha256.slice(0, 20)}...  |  EntryHash: ${entry.entryHash.slice(0, 20)}...`,
        8.2,
      );
    }
  }

  // 14. Recommended Human Review & Investigator Verification Sign-Off
  addSectionTitle('14. Human Investigator Verification & Sign-Off');
  const review = data.case.humanReview;
  const checkedSet = new Set(review?.checkedItems ?? []);
  addParagraph(
    `Verification Status: ${(review?.status ?? 'pending').toUpperCase()}${review?.signedOffBy ? `  |  Signed Off By: ${review.signedOffBy}` : ''}${review?.signedOffAt ? `  |  Signed At: ${new Date(review.signedOffAt).toISOString()}` : ''}`,
    9,
    review?.signedOffBy ? [21, 128, 61] : [51, 65, 85],
  );
  if (review?.reviewerNote) {
    addParagraph(`Investigator Field Notes: ${review.reviewerNote}`, 8.8);
  }
  for (const chk of data.case.recommendedChecks ?? []) {
    const done = checkedSet.has(chk);
    addParagraph(`${done ? '[x]' : '[ ]'} ${chk}`, 8.8);
  }
  const decisionEntries = Object.entries(review?.findingDecisions ?? {});
  if (decisionEntries.length > 0) {
    const findingNameById = new Map(findingsList.map((f) => [f.id, f.indicator]));
    for (const [fId, decision] of decisionEntries) {
      addParagraph(
        `* Triage [${decision.toUpperCase()}]: ${findingNameById.get(fId) ?? fId}`,
        8.4,
      );
    }
  }

  doc.save(`TruthLens_14Point_Report_${data.case.id.slice(0, 8)}.pdf`);
}
