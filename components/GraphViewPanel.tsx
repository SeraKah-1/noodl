
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, Loader2, Download, RefreshCw, X, Maximize2, Minimize2, FileJson, FileCode } from 'lucide-react';
import { generateKnowledgeGraph, type GraphViewResult, type GraphData } from '../services/graphViewService';
import { saveQuizKnowledgeGraph, HISTORY_IDB_KEY } from '../services/storageService';
import { get } from 'idb-keyval';
import type { Question } from '../types';
import { t, getLocale } from '../services/i18n';

export type CachedKnowledgeGraph = {
  data: GraphData;
  htmlCode: string;
  generatedAt?: string;
};

interface GraphViewPanelProps {
  questions: Question[];
  title?: string;
  materialContext?: string;
  quizId?: string | number;
  /** Cached graph from history — skip regenerate when present */
  initialGraph?: CachedKnowledgeGraph | null;
  onClose: () => void;
}

export const GraphViewPanel: React.FC<GraphViewPanelProps> = ({
  questions,
  title = 'Knowledge Graph',
  materialContext,
  quizId,
  initialGraph,
  onClose,
}) => {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    initialGraph?.htmlCode || initialGraph?.data?.nodes?.length ? 'ready' : 'idle'
  );
  const [result, setResult] = useState<GraphViewResult | null>(
    initialGraph?.data
      ? {
          data: initialGraph.data,
          htmlCode: initialGraph.htmlCode || '',
          status: 'success',
        }
      : null
  );
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bootstrappedRef = useRef(false);

  const handleGenerate = useCallback(async () => {
    if (questions.length < 3) {
      setError(
        getLocale() === 'id'
          ? 'Minimal 3 soal untuk knowledge graph.'
          : 'Need at least 3 questions for a knowledge graph.'
      );
      setState('error');
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
        setError(graphResult.error || t('graphBuildFail'));
        return;
      }

      setResult(graphResult);
      setState('ready');

      // Persist so leaving the panel does not force full regenerate
      if (quizId && graphResult.data) {
        await saveQuizKnowledgeGraph(quizId, {
          data: graphResult.data,
          htmlCode: graphResult.htmlCode || '',
          generatedAt: graphResult.data.generatedAt || new Date().toISOString(),
        }).catch((e) => console.error('Failed to save knowledge graph', e));
      }
    } catch (err: any) {
      setState('error');
      setError(err.message || t('graphBuildFail'));
    }
  }, [questions, title, materialContext, quizId]);

  // Bootstrap once: use prop cache → IDB cache → generate
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let cancelled = false;

    (async () => {
      if (initialGraph?.data?.nodes?.length) {
        if (!cancelled) {
          setResult({
            data: initialGraph.data,
            htmlCode: initialGraph.htmlCode || '',
            status: 'success',
          });
          setState('ready');
        }
        return;
      }

      if (quizId) {
        try {
          const history: any = await get(HISTORY_IDB_KEY);
          const quiz = history?.find((q: any) => String(q.id) === String(quizId));
          const cached = quiz?.knowledgeGraphData as CachedKnowledgeGraph | undefined;
          if (cached?.data?.nodes?.length) {
            if (!cancelled) {
              setResult({
                data: cached.data,
                htmlCode: cached.htmlCode || '',
                status: 'success',
              });
              setState('ready');
            }
            return;
          }
        } catch (e) {
          console.error('Failed to load knowledge graph cache', e);
        }
      }

      if (!cancelled) await handleGenerate();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const blob = new Blob([JSON.stringify(result.data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KnowledgeGraph_${title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const nodeCount = result?.data?.nodes?.length || 0;
  const edgeCount = result?.data?.edges?.length || 0;

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <Network size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100">
                Knowledge Graph
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {nodeCount
                  ? getLocale() === 'id'
                    ? `${nodeCount} konsep · ${edgeCount} relasi`
                    : `${nodeCount} concepts · ${edgeCount} links`
                  : t('graphSubtitle')}
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
                  title={t('graphRegenerate')}
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

        <div className="flex-1 overflow-hidden relative">
          {state === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-slate-900">
              <div className="relative">
                <Loader2 size={48} className="text-indigo-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Network size={20} className="text-indigo-600" />
                </div>
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-6">
                {progress ||
                  (getLocale() === 'id' ? 'Menganalisis konsep…' : 'Analyzing concepts…')}
              </p>
            </div>
          )}

          {state === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
              <p className="text-rose-600 font-bold mb-2">{t('graphBuildFail')}</p>
              <p className="text-sm text-slate-500 mb-4 max-w-md">{error}</p>
              <button
                onClick={handleGenerate}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold"
              >
                {t('graphRetry')}
              </button>
            </div>
          )}

          {state === 'ready' && result && (
            <>
              {result.htmlCode ? (
                <iframe
                  ref={iframeRef}
                  title="Knowledge Graph"
                  srcDoc={result.htmlCode}
                  className="w-full h-full border-0 bg-white dark:bg-slate-950"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <div className="p-6 overflow-y-auto h-full">
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                    {result.data.summary}
                  </p>
                  <ul className="space-y-2">
                    {result.data.nodes.map((n) => (
                      <li
                        key={n.id}
                        className="text-sm px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800"
                      >
                        <span className="font-bold">{n.label}</span>
                        <span className="text-slate-400 ml-2 text-xs">
                          {n.category} · {n.importance}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={handleGenerate}
                    className="mt-4 text-sm text-indigo-600 font-bold"
                  >
                    {t('graphRegenerate')} (HTML)
                  </button>
                </div>
              )}
            </>
          )}

          {state === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Loader2 size={32} className="text-indigo-400 animate-spin mb-3" />
              <p className="text-sm text-slate-500">{t('graphSubtitle')}</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
