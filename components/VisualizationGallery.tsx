import { t, getLocale } from '../services/i18n';
import { PageHeader } from './PageHeader';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Check, X, ChevronRight, RefreshCw, Wand2, Eye, Zap, AlertTriangle, Cloud, CloudLightning, CloudOff, UploadCloud, Plus } from 'lucide-react';
import { scanForVisualizations, generateVisualizations, generateVisualization, scanForAdditionalVisualizations } from '../services/visualizationService';
import { SimulationRenderer } from './SimulationRenderer';
import type { VisualizationBlueprint, VisualizationResult } from '../types';
import { HISTORY_IDB_KEY, uploadQuizToCloud } from '../services/storageService';
import { get, set } from 'idb-keyval';
import { auth } from '../supabase';

// ─── VIZ TYPE STYLING ───
const VIZ_TYPE_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  SIMULATION:   { icon: '⚡', color: 'text-indigo-600 dark:text-indigo-400',  bg: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800' },
  DIAGRAM:      { icon: '🔬', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' },
  CHART:        { icon: '📊', color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' },
  PROCESS_FLOW: { icon: '🔄', color: 'text-cyan-600 dark:text-cyan-400',    bg: 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800' },
  '3D_MODEL':   { icon: '🧊', color: 'text-pink-600 dark:text-pink-400',    bg: 'bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800' },
};

const PRIORITY_STYLE: Record<string, { label: string; dot: string }> = {
  HIGH:     { label: 'Prioritas Tinggi', dot: 'bg-rose-500' },
  MODERATE: { label: 'Sedang',          dot: 'bg-blue-500' },
  LOW:      { label: 'Rendah',          dot: 'bg-slate-400' },
};

type GalleryState = 'IDLE' | 'SCANNING' | 'REVIEWING' | 'GENERATING' | 'COMPLETE';

interface VisualizationGalleryProps {
  quizId?: number | string;
  materialContext: string;
  existingConcepts?: string[];
  initialBlueprints?: VisualizationBlueprint[];
  initialResults?: VisualizationResult[];
  onSaveVisualizations?: (blueprints: VisualizationBlueprint[], results: VisualizationResult[]) => void;
}

export const VisualizationGallery: React.FC<VisualizationGalleryProps> = ({
  quizId,
  materialContext,
  existingConcepts = [],
  initialBlueprints,
  initialResults,
  onSaveVisualizations
}) => {
  const [state, setState] = useState<GalleryState>('IDLE');
  const [blueprints, setBlueprints] = useState<VisualizationBlueprint[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<VisualizationResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [error, setError] = useState<string | null>(null);
  const [isAddingMore, setIsAddingMore] = useState(false);

  const hasInitializedRef = useRef(false);

  // Cloud Sync States
  const [quiz, setQuiz] = useState<any | null>(null);
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (quizId) {
      get(HISTORY_IDB_KEY).then((history: any) => {
        if (history) {
          const foundQuiz = history.find((q: any) => String(q.id) === String(quizId));
          if (foundQuiz) {
            setQuiz(foundQuiz);
            const isSynced = foundQuiz.authorId !== 'local' && foundQuiz.authorId !== undefined;
            setIsCloudSynced(isSynced);
          }
        }
      }).catch(e => console.error("Gagal memuat kuis dari IDB untuk status cloud:", e));
    }
  }, [quizId, currentUser]);

  const handleUpload = async () => {
    if (!quiz || !quizId) return;
    setIsUploading(true);
    try {
      const history = await get(HISTORY_IDB_KEY);
      const latestQuiz = history?.find((q: any) => String(q.id) === String(quizId)) || quiz;
      
      await uploadQuizToCloud(latestQuiz);
      
      if (auth.currentUser) {
        latestQuiz.authorId = auth.currentUser.uid;
        latestQuiz.userId = auth.currentUser.uid;
        await set(HISTORY_IDB_KEY, history.map((q: any) => String(q.id) === String(quizId) ? latestQuiz : q));
        setQuiz(latestQuiz);
        setIsCloudSynced(true);
      }
      
      alert('Uploaded to cloud.');
    } catch (err: any) {
      alert('Upload failed: ' + (err.message || String(err)));
    } finally {
      setIsUploading(false);
    }
  };

  // Initialize from cache if present
  useEffect(() => {
    if (state !== 'IDLE') return; // Don't override active user session
    if (!hasInitializedRef.current && initialBlueprints && initialBlueprints.length > 0) {
      hasInitializedRef.current = true;
      setBlueprints(initialBlueprints);
      setSelectedIds(new Set(initialBlueprints.map(b => b.id)));
      if (initialResults && initialResults.length > 0) {
        setResults(initialResults);
        setState('COMPLETE');
      } else {
        setState('REVIEWING');
      }
    }
  }, [initialBlueprints, initialResults, state]);

  // Save progress when blueprints or results change
  const saveRef = useRef(onSaveVisualizations);
  useEffect(() => {
    saveRef.current = onSaveVisualizations;
  }, [onSaveVisualizations]);

  useEffect(() => {
    if (state === 'REVIEWING' || state === 'GENERATING' || state === 'COMPLETE') {
      if (saveRef.current) {
        saveRef.current(blueprints, results);
      }
    }
  }, [blueprints, results, state]);

  // Sort results based on the original blueprints order to avoid order shuffling on retry/resume
  const sortedResults = React.useMemo(() => {
    return blueprints
      .map(bp => results.find(r => r.id === bp.id))
      .filter((r): r is VisualizationResult => r !== undefined);
  }, [blueprints, results]);

  // ─── PHASE 1: SCAN ───
  const handleScan = useCallback(async () => {
    if (!materialContext || materialContext.length < 50) {
      setError('Material is too short to analyze.');
      return;
    }

    setState('SCANNING');
    setError(null);
    setBlueprints([]);
    setResults([]);

    try {
      const scanned = await scanForVisualizations(materialContext, (msg) => {
        setProgress(prev => ({ ...prev, message: msg }));
      });

      if (scanned.length === 0) {
        setError('No suitable concepts found for visualization.');
        setState('IDLE');
        return;
      }

      setBlueprints(scanned);
      // Auto-select HIGH and MODERATE priority
      const autoSelected = new Set(
        scanned
          .filter(b => b.priority === 'HIGH' || b.priority === 'MODERATE')
          .map(b => b.id)
      );
      setSelectedIds(autoSelected);
      setState('REVIEWING');
    } catch (err: any) {
      setError(`Scan failed: ${err.message}`);
      setState('IDLE');
    }
  }, [materialContext]);

  // ─── PHASE 2: GENERATE ───
  const handleGenerate = useCallback(async () => {
    // Only pick selected blueprints that DO NOT have a successful result already
    const pendingBlueprints = blueprints.filter(b => 
      selectedIds.has(b.id) && !results.some(r => r.id === b.id && r.status === 'success')
    );

    if (pendingBlueprints.length === 0) {
       setState('COMPLETE');
       return;
    }

    setState('GENERATING');
    // Remove old failed results for the ones we are retrying
    setResults(prev => prev.filter(r => !(pendingBlueprints.some(pb => pb.id === r.id))));
    
    setProgress({ current: 0, total: pendingBlueprints.length, message: '' });

    try {
      await generateVisualizations(
        pendingBlueprints,
        materialContext,
        (result, index, total) => {
          setResults(prev => [...prev, result]);
          setProgress({ current: index + 1, total, message: `${result.blueprint.concept}` });
        },
        (msg) => setProgress(prev => ({ ...prev, message: msg }))
      );
      setState('COMPLETE');
    } catch (err: any) {
      setError(`Could not build visualization: ${err.message}`);
      setState('COMPLETE');
    }
  }, [blueprints, selectedIds, materialContext, results]);

  // ─── SINGLE RETRY ───
  const handleRetrySingle = useCallback(async (blueprint: VisualizationBlueprint) => {
    // 1. Set status to generating locally
    setResults(prev => {
      const exists = prev.some(r => r.id === blueprint.id);
      if (exists) {
        return prev.map(r => r.id === blueprint.id ? {
          id: blueprint.id,
          blueprint,
          htmlCode: '',
          explanation: '',
          interactionGuide: '',
          status: 'generating' as const
        } : r);
      } else {
        return [...prev, {
          id: blueprint.id,
          blueprint,
          htmlCode: '',
          explanation: '',
          interactionGuide: '',
          status: 'generating' as const
        }];
      }
    });

    try {
      // 2. Call generateVisualization for this specific concept
      const result = await generateVisualization(blueprint, materialContext);
      
      // 3. Update the result in the state
      setResults(prev => prev.map(r => r.id === blueprint.id ? result : r));
    } catch (err: any) {
      setResults(prev => prev.map(r => r.id === blueprint.id ? {
        id: blueprint.id,
        blueprint,
        htmlCode: '',
        explanation: '',
        interactionGuide: '',
        status: 'error' as const,
        error: err.message || 'Could not build visualization'
      } : r));
    }
  }, [materialContext]);

  // ─── SINGLE REGENERATE WITH USER FEEDBACK ───
  const handleRegenerateSingle = useCallback(async (blueprint: VisualizationBlueprint, feedback?: string) => {
    // Find existing result to get its htmlCode for iterative updates
    const existingResult = results.find(r => r.id === blueprint.id);
    const existingHtml = existingResult?.htmlCode || '';

    // 1. Set status to generating locally
    setResults(prev => prev.map(r => r.id === blueprint.id ? {
      ...r,
      status: 'generating' as const
    } : r));

    try {
      // 2. Call generateVisualization for this specific concept with feedback & existing HTML
      const result = await generateVisualization(blueprint, materialContext, undefined, feedback, existingHtml);
      
      // 3. Update the result in the state
      setResults(prev => prev.map(r => r.id === blueprint.id ? result : r));
    } catch (err: any) {
      setResults(prev => prev.map(r => r.id === blueprint.id ? {
        ...r,
        status: 'error' as const,
        error: err.message || 'Could not regenerate visualization'
      } : r));
    }
  }, [materialContext, results]);

  // ─── TOGGLE SELECT ───
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(blueprints.map(b => b.id)));
  const deselectAll = () => setSelectedIds(new Set());

  // ─── RESET ───
  const handleReset = () => {
    setState('IDLE');
    setBlueprints([]);
    setSelectedIds(new Set());
    setResults([]);
    setProgress({ current: 0, total: 0, message: '' });
    setError(null);
    setIsAddingMore(false);
    if (onSaveVisualizations) onSaveVisualizations([], []);
  };

  // ─── FITUR 4: ADD MORE VISUALIZATIONS ───
  const handleAddMore = useCallback(async () => {
    if (!materialContext || materialContext.length < 50) {
      setError('Material is too short for more concepts.');
      return;
    }

    setIsAddingMore(true);
    setError(null);

    try {
      const existingConcepts = blueprints.map(b => b.concept);
      const additionalBlueprints = await scanForAdditionalVisualizations(
        materialContext,
        existingConcepts,
        (msg) => setProgress(prev => ({ ...prev, message: msg }))
      );

      if (additionalBlueprints.length === 0) {
        setError('No additional concepts found.');
        setIsAddingMore(false);
        return;
      }

      // Append new blueprints
      setBlueprints(prev => [...prev, ...additionalBlueprints]);
      // Auto-select new ones
      setSelectedIds(prev => {
        const next = new Set(prev);
        additionalBlueprints.forEach(b => next.add(b.id));
        return next;
      });
      setState('REVIEWING');
    } catch (err: any) {
      setError(`Could not find more concepts: ${err.message}`);
    } finally {
      setIsAddingMore(false);
    }
  }, [materialContext, blueprints]);

  return (
    <div className="w-full relative z-10">
      {/* ─── SECTION HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="text-indigo-600">(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</span> {t('aiSimBtn')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Bikin konsep abstrak jadi nyata dan bisa dimainkan
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Cloud Sync Status Indicator */}
          {quizId && (
            <div className="flex items-center">
              {!currentUser ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 border border-slate-200/40" title="Sign in to save to cloud">
                  <CloudOff size={14} />
                  <span>Noodl Cloud Offline</span>
                </div>
              ) : isCloudSynced ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/40">
                  <Cloud size={14} />
                  <Check size={12} strokeWidth={3} />
                  <span>Tersimpan di Cloud</span>
                </div>
              ) : (
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 transition-all border border-amber-200/40 shadow-sm"
                  title="Upload quiz and simulations to cloud"
                >
                  {isUploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CloudLightning size={14} />
                  )}
                  <span>Upload ke Cloud</span>
                </button>
              )}
            </div>
          )}

          {state !== 'IDLE' && state !== 'SCANNING' && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors border border-rose-100 dark:border-rose-900/60 shadow-sm"
            >
              <RefreshCw size={14} />
              {t('restart')}
            </button>
          )}
        </div>
      </div>

      {/* ─── ERROR BANNER ─── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-6 p-4 bg-red-50/80 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 rounded-2xl flex items-start gap-3"
          >
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm text-red-700 dark:text-red-400 font-medium">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ STATE: IDLE ═══ */}
      {state === 'IDLE' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <div className="inline-flex flex-col items-center">
            {/* Animated Icon */}
            <motion.div
              animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-6 backdrop-blur-xl border-4 border-white/40"
            >
              <Sparkles size={40} className="text-white" />
            </motion.div>

            <h3 className="text-xl font-black text-slate-700 dark:text-slate-200 mb-2">
              (⌐■_■) {t('timeToSim')}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-8 leading-relaxed">
              {t('simDesc')}
            </p>

            <button
              onClick={handleScan}
              disabled={!materialContext || materialContext.length < 50}
              className="group inline-flex items-center gap-3 px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-bold text-base shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <Wand2 size={20} />
              {t('analyzeNow')}
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ═══ STATE: SCANNING ═══ */}
      {state === 'SCANNING' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/25 mx-auto mb-6 backdrop-blur-xl border-4 border-white/40"
          >
            <Eye size={32} className="text-white" />
          </motion.div>
          <h3 className="text-lg font-black text-slate-700 dark:text-slate-200 mb-2">
            ( •_•)&gt;⌐■-■ Sedang Mengincar Konsep...
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            {progress.message || 'Finding concepts worth visualizing…'}
          </p>
        </motion.div>
      )}

      {/* ═══ STATE: REVIEWING BLUEPRINTS ═══ */}
      {state === 'REVIEWING' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Summary Bar */}
          <div className="flex items-center justify-between mb-4 p-4 bg-indigo-50/90 dark:bg-indigo-950/50 rounded-2xl border border-indigo-100/80 dark:border-indigo-800/60 shadow-sm backdrop-blur-md">
            <p className="text-sm font-black text-indigo-800 dark:text-indigo-300">
              🎯 Ketemu {blueprints.length} konsep mantap!
            </p>
            <div className="flex gap-3">
              <button onClick={selectAll} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 transition-colors">
                {t('selectAll')}
              </button>
              <span className="text-indigo-300">|</span>
              <button onClick={deselectAll} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 transition-colors">
                Reset
              </button>
            </div>
          </div>

          {/* Blueprint Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {blueprints.map((bp, idx) => {
              const isSelected = selectedIds.has(bp.id);
              const typeStyle = VIZ_TYPE_STYLE[bp.vizType] || VIZ_TYPE_STYLE.SIMULATION;
              const priorityStyle = PRIORITY_STYLE[bp.priority] || PRIORITY_STYLE.MODERATE;

              return (
                <motion.button
                  key={bp.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => toggleSelect(bp.id)}
                  className={`w-full text-left p-5 rounded-2xl border-2 transition-all duration-300 flex items-start gap-4 ${
                    isSelected
                      ? 'border-indigo-500 bg-gradient-to-br from-indigo-50/80 to-purple-50/80 shadow-md shadow-indigo-500/10'
                      : 'border-white bg-white/60 hover:bg-white hover:border-slate-200 hover:shadow-lg'
                  } backdrop-blur-xl`}
                >
                  {/* Checkbox */}
                  <div className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
                    isSelected
                      ? 'bg-indigo-500 border-indigo-500 scale-110 shadow-sm shadow-indigo-500/40'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}>
                    {isSelected && <Check size={14} className="text-white" strokeWidth={4} />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider border ${typeStyle.bg}`}>
                        <span>{typeStyle.icon}</span>
                        <span className={typeStyle.color}>{bp.vizType.replace('_', ' ')}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-bold bg-white/50 px-2 py-1 rounded-lg border border-slate-100">
                        <span className={`w-2 h-2 rounded-full ${priorityStyle.dot}`} />
                        {priorityStyle.label}
                      </span>
                    </div>

                    <h4 className="font-black text-slate-800 dark:text-slate-100 text-[15px] leading-tight mb-1">
                      {bp.concept}
                    </h4>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {bp.description}
                    </p>

                    {bp.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {bp.variables.slice(0, 3).map((v, i) => (
                          <span key={i} className="px-2 py-1 bg-white dark:bg-slate-700/50 border border-slate-200/60 rounded-md text-[10px] text-indigo-700 dark:text-indigo-300 font-bold shadow-sm">
                            🎛 {v}
                          </span>
                        ))}
                        {bp.variables.length > 3 && (
                          <span className="px-2 py-1 bg-slate-100/50 rounded-md text-[10px] text-slate-500 font-bold">
                            +{bp.variables.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Generate Button */}
          <div className="flex justify-center">
            {(() => {
              const pendingCount = blueprints.filter(b => selectedIds.has(b.id) && !results.some(r => r.id === b.id && r.status === 'success')).length;
              const hasExistingResults = results.some(r => r.status === 'success');
              
              return (
                <button
                  onClick={handleGenerate}
                  disabled={pendingCount === 0 && !hasExistingResults}
                  className="group inline-flex items-center gap-3 px-10 py-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-500/25 hover:shadow-2xl hover:shadow-purple-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <Sparkles size={24} className="group-hover:animate-spin-slow" />
                  {pendingCount === 0 && hasExistingResults
                    ? `${t('viewResults')} (⌐■_■)`
                    : (hasExistingResults
                        ? t('continueGen').replace('{n}', String(pendingCount))
                        : t('generateNSim').replace('{n}', String(pendingCount)))}
                  <ChevronRight size={20} className="group-hover:translate-x-1.5 transition-transform" />
                </button>
              );
            })()}
          </div>
        </motion.div>
      )}

      {/* ═══ STATE: GENERATING (Progressive) ═══ */}
      {state === 'GENERATING' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Progress Bar */}
          <div className="mb-8 p-5 bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl rounded-3xl border border-white/60 dark:border-slate-700/60 shadow-xl shadow-indigo-500/5">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-2">
              <div className="flex items-center gap-3">
                <Loader2 size={24} className="animate-spin text-indigo-500" />
                <p className="text-base font-black text-slate-800 dark:text-slate-100">
                  ( ˘ ³˘)♥ {getLocale() === 'id' ? 'Meracik kode' : 'Cooking code'} ({progress.current}/{progress.total})
                </p>
              </div>
              <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1.5 rounded-lg">
                {progress.message}
              </p>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3 overflow-hidden shadow-inner">
              <motion.div
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 h-full rounded-full relative"
                animate={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                transition={{ duration: 0.5 }}
              >
                 <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
              </motion.div>
            </div>
          </div>

          {/* Results so far (Grid layout instead of vertical stack) */}
          {sortedResults.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {sortedResults.map((result, idx) => (
                <motion.div
                  key={result.id}
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.1, type: 'spring' }}
                >
                  <SimulationRenderer 
                    visualization={result} 
                    onRetry={() => handleRetrySingle(result.blueprint)}
                    onRegenerate={(feedback) => handleRegenerateSingle(result.blueprint, feedback)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* ═══ STATE: COMPLETE ═══ */}
      {state === 'COMPLETE' && results.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Summary Banner */}
          <div className="mb-8 p-5 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 rounded-3xl border border-emerald-200/60 dark:border-emerald-800/40 shadow-sm backdrop-blur-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-4">
              <span className="flex items-center gap-3 text-emerald-800 dark:text-emerald-300 font-black text-lg">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Check size={18} className="text-emerald-600" />
                </div>
                (⌐■_■) {t('simReady').replace('{n}', String(results.filter(r => r.status === 'success').length))}
                {results.filter(r => r.status === 'error').length > 0 && (
                  <span className="text-rose-500 font-bold text-sm bg-rose-100 px-2 py-1 rounded-lg ml-2">
                    {t('failedCount').replace('{n}', String(results.filter(r => r.status === 'error').length))}
                  </span>
                )}
              </span>
              <button 
                onClick={() => setState('REVIEWING')} 
                className="px-5 py-2.5 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors shadow-sm border border-slate-200/60"
              >
                {t('pickAgain')}
              </button>
              <button
                onClick={handleAddMore}
                disabled={isAddingMore}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isAddingMore ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Tambah Visualisasi Baru
              </button>
            </div>
          </div>

          {/* Results Gallery (Grid Layout) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {sortedResults.map((result, idx) => (
              <motion.div
                key={result.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1, type: 'spring' }}
              >
                <SimulationRenderer 
                  visualization={result} 
                  onRetry={() => handleRetrySingle(result.blueprint)}
                  onRegenerate={(feedback) => handleRegenerateSingle(result.blueprint, feedback)}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {state === 'COMPLETE' && results.length === 0 && (
        <div className="text-center py-16 bg-white/50 rounded-3xl border border-white">
          <p className="text-slate-500 dark:text-slate-400 font-medium">(╥﹏╥) Yah, tidak ada visualisasi yang berhasil dibuat.</p>
        </div>
      )}
    </div>
  );
};
