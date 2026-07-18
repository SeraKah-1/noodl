
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Loader2, Download, RefreshCw, X, Maximize2, Minimize2, FileJson, FileCode } from 'lucide-react';
import { generateKnowledgeGraph, buildGraphHtmlLocal, type GraphViewResult, type GraphData } from '../services/graphViewService';
import { saveQuizKnowledgeGraph, loadQuizKnowledgeGraph } from '../services/storageService';
import type { Question } from '../types';
import { t, getLocale } from '../services/i18n';

interface GraphViewPanelProps {
  questions: Question[];
  title?: string;
  materialContext?: string;
  quizId?: string | number;
  initialData?: GraphData;
  initialHtml?: string;
  onClose: () => void;
  onSaved?: (payload: { data: GraphData; htmlCode: string }) => void;
}

export const GraphViewPanel: React.FC<GraphViewPanelProps> = ({
  questions,
  title = 'Knowledge Graph',
  materialContext,
  quizId,
  initialData,
  initialHtml,
  onClose,
  onSaved,
}) => {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    initialData || initialHtml ? 'ready' : 'idle'
  );
  const [result, setResult] = useState<GraphViewResult | null>(() => {
    if (initialData) {
      const html = initialHtml || buildGraphHtmlLocal(initialData, title);
      return { data: initialData, htmlCode: html, status: 'success' };
    }
    return null;
  });
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const startedRef = useRef(false);

  const persist = useCallback(
    async (graphResult: GraphViewResult) => {
      if (!quizId || graphResult.status !== 'success') return;
      try {
        await saveQuizKnowledgeGraph(quizId, {
          data: graphResult.data,
          htmlCode: graphResult.htmlCode,
          generatedAt: graphResult.data.generatedAt,
        });
        onSaved?.({ data: graphResult.data, htmlCode: graphResult.htmlCode });
      } catch (e) {
        console.error('[GraphView] persist failed', e);
      }
    },
    [quizId, onSaved]
  );

  const handleGenerate = useCallback(async (force = false) => {
    if (questions.length < 3) {
      setError(getLocale() === 'id'
        ? 'Minimal 3 soal untuk knowledge graph.'
        : 'Need at least 3 questions for a knowledge graph.');
      setState('error');
      return;
    }

    setState('loading');
    setError(null);

    try {
      // Load cache unless force regenerate
      if (!force && quizId) {
        const cached = await loadQuizKnowledgeGraph(quizId);
        if (cached?.data?.nodes?.length) {
          const html =
            cached.htmlCode ||
            buildGraphHtmlLocal(cached.data, title);
          const cachedResult: GraphViewResult = {
            data: cached.data,
            htmlCode: html,
            status: 'success',
          };
          setResult(cachedResult);
          setState('ready');
          return;
        }
      }

      const graphResult = await generateKnowledgeGraph(
        questions,
        title,
        materialContext,
        (msg) => setProgress(msg)
      );

      if (graphResult.status === 'error') {
        setState('error');
        setError(graphResult.error || (getLocale() === 'id' ? 'Gagal membuat graph.' : 'Could not build graph.'));
        return;
      }

      setResult(graphResult);
      setState('ready');
      await persist(graphResult);
    } catch (err: any) {
      setState('error');
      setError(err.message || (getLocale() === 'id' ? 'Terjadi kesalahan.' : 'Something went wrong building the graph.'));
    }
  }, [questions, title, materialContext, quizId, persist]);

  // Auto-load cache or generate once
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialData) {
      // already ready
      return;
    }
    handleGenerate(false);
  }, [handleGenerate, initialData]);

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

  const htmlSrc = result?.htmlCode || '';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? '' : 'p-4'} bg-slate-900/50 backdrop-blur-sm`}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`bg-white dark:bg-slate-950 shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 ${
          isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[90vh] rounded-3xl'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90">
          <div className="flex items-center gap-2 min-w-0">
            <Network className="text-indigo-500 shrink-0" size={20} />
            <div className="min-w-0">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 truncate">{title}</h2>
              <p className="text-[11px] text-slate-500 truncate">
                {getLocale() === 'id'
                  ? 'Disimpan di kuis ini · buka lagi tanpa generate ulang'
                  : 'Saved on this quiz · reopen without regenerating'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {state === 'ready' && (
              <>
                <button type="button" onClick={handleExportJSON} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" title="JSON">
                  <FileJson size={18} />
                </button>
                <button type="button" onClick={handleExportHTML} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500" title="HTML">
                  <FileCode size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  title={getLocale() === 'id' ? 'Regenerate' : 'Regenerate'}
                >
                  <RefreshCw size={18} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setIsFullscreen((v) => !v)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-rose-50 text-slate-500 hover:text-rose-600">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative bg-slate-900">
          <AnimatePresence mode="wait">
            {state === 'loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center text-indigo-200 gap-3"
              >
                <Loader2 className="animate-spin" size={36} />
                <p className="text-sm font-medium px-6 text-center">{progress || (getLocale() === 'id' ? 'Memproses…' : 'Working…')}</p>
              </motion.div>
            )}
            {state === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
              >
                <p className="text-rose-300 text-sm max-w-md">{error}</p>
                <button
                  type="button"
                  onClick={() => handleGenerate(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"
                >
                  {getLocale() === 'id' ? 'Coba lagi' : 'Try again'}
                </button>
              </motion.div>
            )}
            {state === 'ready' && htmlSrc && (
              <motion.iframe
                key="frame"
                ref={iframeRef as any}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                srcDoc={htmlSrc}
                sandbox="allow-scripts"
                className="absolute inset-0 w-full h-full border-0"
                title="Knowledge graph"
              />
            )}
            {state === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => handleGenerate(false)}
                  className="px-5 py-3 rounded-2xl bg-indigo-600 text-white font-bold flex items-center gap-2"
                >
                  <Network size={18} />
                  {getLocale() === 'id' ? 'Buat Knowledge Graph' : 'Build Knowledge Graph'}
                </button>
              </div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
