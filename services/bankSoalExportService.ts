
/**
 * ==========================================
 * BANK SOAL EXPORT SERVICE
 * ==========================================
 * Exports quiz questions as JSON, CSV, or PDF.
 * This is separate from pdfExportService (which handles Peta Pemahaman).
 * 
 * Supports:
 * - Single quiz export
 * - Multi-quiz merge export (for Virtual Mixer)
 * - JSON (re-importable), CSV (spreadsheet/Anki), PDF (print/study)
 */

import React from 'react';
import { pdf } from '@react-pdf/renderer';
import type { Question } from '../types';
import { BankSoalPdf } from '../components/BankSoalPdfDocument';

// ─── HELPERS ───

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const sanitizeFilename = (name: string): string =>
  name.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF ]/g, '').replace(/\s+/g, '_').substring(0, 50);

// ─── JSON EXPORT ───

interface BankSoalExportData {
  version: '1.0';
  exportedAt: string;
  source: string;
  questionCount: number;
  questions: Question[];
  metadata?: {
    modelId?: string;
    mode?: string;
    examStyle?: string[];
    topic?: string;
  };
}

export const exportBankSoalJSON = (
  questions: Question[],
  title: string,
  metadata?: BankSoalExportData['metadata']
): void => {
  const data: BankSoalExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    source: title,
    questionCount: questions.length,
    questions,
    metadata
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  downloadBlob(blob, `BankSoal_${sanitizeFilename(title)}.json`);
};

// ─── CSV EXPORT ───

const escapeCSV = (val: string): string => {
  if (!val) return '';
  // Wrap in quotes if contains comma, newline, or quote
  const s = String(val);
  if (s.includes(',') || s.includes('\n') || s.includes('"') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

export const exportBankSoalCSV = (questions: Question[], title: string): void => {
  // BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';
  
  const headers = [
    'No',
    'Soal',
    'Tipe',
    'Opsi A',
    'Opsi B',
    'Opsi C',
    'Opsi D',
    'Jawaban Benar',
    'Penjelasan',
    'Hint',
    'Key Point',
    'Difficulty'
  ];

  const rows = questions.map((q, i) => {
    const correctLetter = q.options.length > 0 
      ? String.fromCharCode(65 + q.correctIndex) 
      : (q.correctAnswer || '');
    
    return [
      i + 1,
      escapeCSV(q.text),
      escapeCSV(q.type || 'MULTIPLE_CHOICE'),
      escapeCSV(q.options[0] || ''),
      escapeCSV(q.options[1] || ''),
      escapeCSV(q.options[2] || ''),
      escapeCSV(q.options[3] || ''),
      escapeCSV(`${correctLetter}: ${q.options[q.correctIndex] || q.correctAnswer || ''}`),
      escapeCSV(q.explanation || ''),
      escapeCSV(q.hint || ''),
      escapeCSV(q.keyPoint || ''),
      escapeCSV(q.difficulty || 'Medium')
    ].join(',');
  });

  const csv = BOM + headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `BankSoal_${sanitizeFilename(title)}.csv`);
};

// ─── PDF EXPORT ───

export const exportBankSoalPDF = async (
  questions: Question[],
  title: string,
  options: { includeAnswers: boolean } = { includeAnswers: true }
): Promise<void> => {
  try {
    const filename = `BankSoal_${sanitizeFilename(title)}.pdf`;
    const doc = React.createElement(BankSoalPdf, {
      questions,
      title,
      includeAnswers: options.includeAnswers
    });
    const blob = await pdf(doc).toBlob();
    downloadBlob(blob, filename);
  } catch (err) {
    console.error('[BankSoal Export] PDF export failed:', err);
    throw new Error('Gagal membuat PDF Bank Soal. Silakan coba lagi.');
  }
};

// ─── MERGED EXPORT (Multi-Quiz) ───

export const exportMergedBankSoal = async (
  quizzes: Array<{ title: string; questions: Question[] }>,
  format: 'json' | 'csv' | 'pdf'
): Promise<void> => {
  // Flatten and deduplicate by question text
  const seen = new Set<string>();
  const merged: Question[] = [];
  
  for (const quiz of quizzes) {
    for (const q of quiz.questions) {
      const key = q.text.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(q);
      }
    }
  }

  const mergedTitle = `Gabungan_${quizzes.length}_Kuis`;

  switch (format) {
    case 'json':
      exportBankSoalJSON(merged, mergedTitle);
      break;
    case 'csv':
      exportBankSoalCSV(merged, mergedTitle);
      break;
    case 'pdf':
      await exportBankSoalPDF(merged, mergedTitle);
      break;
  }
};
