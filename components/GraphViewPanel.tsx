
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Loader2, Download, RefreshCw, X, Maximize2, Minimize2, FileJson, Image, FileCode } from 'lucide-react';
import { generateKnowledgeGraph, type GraphViewResult, type GraphData } from '../services/graphViewService';
import type { Question } from '../types';

interface GraphViewPanelProps {
  questions: Question[];
  title?: string;
  materialContext?: string;
  quizId?: string | number;
  initialData?: GraphData;
  onClose: () => void;
}

export const GraphViewPanel: React.FC<GraphViewPanelProps> = ({
  questions,
  title = 'Knowledge Graph',
  materialContext,
  quizId,
  initialData,
  onClose
}) => {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    initialData ? 'ready' : 'idle'
  );
  const [result, setResult] = useState<GraphViewResult | null>(
    initialData ? { data: initialData, htmlCode: '', status: 'success' } : null
  );
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleGenerate = useCallback(async () => {
    if (questions.length < 3) {
      setError('Minimal 3 soal diperlukan untuk membuat knowledge graph.');
      return;
    }

    setState('loading');
    setError(null);

    try {
      const graphResult = await generateKnowledgeGraph(
        questions,
        title,
        materialContext,
        (msg) => setProgress(msg)
      );

      if (graphResult.status === 'error') {
        setState('error');
        setError(graphResult.error || 'Gagal membuat graph.');
        return;
      }

      setResult(graphResult);
      setState('ready');
    } catch (err: any) {
      setState('error');
      setError(err.message || 'Terjadi kesalahan saat membuat graph.');
    }
  }, [questions, title, materialContext]);

  // Auto-generate if no initial data
  useEffect(() => {
    if (!initialData && state === 'idle') {
      handleGenerate();
    }
  }, []);

  // Export handlers
  const handleExportHTML = () => {
    if (!result?.htmlCode) return;
    const blob = new Blob([result.htmlCode], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KnowledgeGraph_${title.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (!result?.data) return;
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KnowledgeGraph_${title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = async () => {
    if (!iframeRef.current) return;
    try {
      // Try to capture iframe content
      const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (!iframeDoc) {
        alert('Tidak bisa capture gambar dari graph. Coba export sebagai HTML.');
        return;
      }
      
      // Use html2canvas if available, otherwise fallback
      alert('💡 Untuk export sebagai gambar, gunakan tombol Screenshot browser (Print Screen) atau export sebagai HTML lalu buka dan screenshot.');
    } catch {
      alert('Gunakan export HTML untuk menyimpan graph.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? '' : 'p-4'} bg-slate-900/50 backdrop-blur-sm`}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`bg-white dark:bg-slate-900 flex flex-col overflow-hidden shadow-2xl ${
          isFullscreen 
            ? 'w-full h-full' 
            : 'w-full max-w-6xl h-[90vh] rounded-3xl border border-slate-200 dark:border-slate-700'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Network size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100">Knowledge Graph</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {result?.data?.nodes.length 
                  ? `${result.data.nodes.length} konsep • ${result.data.edges.length} relasi`
                  : 'Peta hubungan antar konsep dari soal'
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {state === 'ready' && (
              <>
                <button
                  onClick={handleExportHTML}
                  className="px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1.5"
                  title="Export HTML"
                >
                  <FileCode size={14} /> HTML
                </button>
                <button
                  onClick={handleExportJSON}
                  className="px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center gap-1.5"
                  title="Export JSON"
                >
                  <FileJson size={14} /> JSON
                </button>
                <button
                  onClick={handleGenerate}
                  className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors"
                  title="Regenerate"
                >
                  <RefreshCw size={16} />
                </button>
              </>
            )}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          {state === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-slate-900">
              <div className="relative">
                <Loader2 size={48} className="text-indigo-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Network size={20} className="text-indigo-600" />
                </div>
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-6">{progress || 'Menganalisis konsep...'}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Proses ini membutuhkan waktu ~30 detik</p>
            </div>
          )}

          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-slate-900 p-8">
              <div className="text-5xl mb-4">😵</div>
              <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400 mb-2">Gagal Membuat Graph</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md mb-6">{error}</p>
              <button
                onClick={handleGenerate}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw size={16} /> Coba Lagi
              </button>
            </div>
          )}

          {state === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-slate-900 p-8">
              <Network size={64} className="text-slate-200 dark:text-slate-700 mb-6" />
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-2">Knowledge Graph</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md mb-6">
                Buat peta hubungan antar konsep dari {questions.length} soal menggunakan AI.
              </p>
              <button
                onClick={handleGenerate}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold hover:from-indigo-600 hover:to-purple-600 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <Network size={16} /> Generate Knowledge Graph
              </button>
            </div>
          )}

          {state === 'ready' && result?.htmlCode && (
            <iframe
              ref={iframeRef}
              srcDoc={result.htmlCode}
              className="w-full h-full border-0"
              sandbox="allow-scripts"
              title="Knowledge Graph"
            />
          )}
        </div>

        {/* Summary Bar */}
        {state === 'ready' && result?.data?.summary && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
              <span className="font-bold text-indigo-600 dark:text-indigo-400">Ringkasan AI:</span> {result.data.summary}
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
