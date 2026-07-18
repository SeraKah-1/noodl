
/**
 * ==========================================
 * PDF EXPORT SERVICE
 * Uses @react-pdf/renderer for robust, paginated PDF generation
 * ==========================================
 */

import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { DeepInsightPdf, OverviewPdf } from '../components/PdfDocument';
import type { DeepInsightData, Question, QuizResult } from '../types';

/**
 * Triggers a browser download of a Blob
 */
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revoke to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

/**
 * Export Deep Insight (AI-generated overview) to PDF
 */
export const exportDeepInsightToPDF = async (
  data: DeepInsightData,
  title: string
): Promise<void> => {
  try {
    const filename = `Peta_Pemahaman_${title.replace(/\s+/g, '_').substring(0, 50)}.pdf`;

    const doc = React.createElement(DeepInsightPdf, { data, title });
    const blob = await pdf(doc).toBlob();
    downloadBlob(blob, filename);
  } catch (err) {
    console.error('[PDF Export] Deep Insight export failed:', err);
    throw new Error('Gagal membuat PDF. Silakan coba lagi.');
  }
};

/**
 * Export Question Overview (non-AI, grouped by topic) to PDF
 */
export const exportOverviewToPDF = async (
  groupedData: Record<string, {
    priority: string;
    questions: Question[];
    totalAnswers: number;
    correctAnswers: number;
  }>,
  questions: Question[],
  result: QuizResult | null | undefined,
  title: string
): Promise<void> => {
  try {
    const filename = `Peta_Pemahaman_${title.replace(/\s+/g, '_').substring(0, 50)}.pdf`;

    const doc = React.createElement(OverviewPdf, {
      groupedData,
      questions,
      result: result || null,
      title
    });
    const blob = await pdf(doc).toBlob();
    downloadBlob(blob, filename);
  } catch (err) {
    console.error('[PDF Export] Overview export failed:', err);
    throw new Error('Gagal membuat PDF. Silakan coba lagi.');
  }
};
