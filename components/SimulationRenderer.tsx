import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, RotateCcw, AlertTriangle, Loader2, Info, X, PowerOff, Sparkles } from 'lucide-react';
import type { VisualizationResult } from '../types';

// ─── VIZ TYPE METADATA ───
const VIZ_TYPE_META: Record<string, { icon: string; label: string; color: string; glow: string }> = {
  SIMULATION:   { icon: '⚡', label: 'Simulasi',      color: 'from-indigo-500 to-violet-600',   glow: 'shadow-indigo-500/30' },
  DIAGRAM:      { icon: '🔬', label: 'Diagram',       color: 'from-emerald-500 to-teal-600',    glow: 'shadow-emerald-500/30' },
  CHART:        { icon: '📊', label: 'Grafik',        color: 'from-amber-500 to-orange-600',    glow: 'shadow-amber-500/30' },
  PROCESS_FLOW: { icon: '🔄', label: 'Alur Proses',   color: 'from-cyan-500 to-blue-600',       glow: 'shadow-cyan-500/30' },
  '3D_MODEL':   { icon: '🧊', label: 'Model 3D',     color: 'from-pink-500 to-rose-600',       glow: 'shadow-pink-500/30' },
};

interface SimulationRendererProps {
  visualization: VisualizationResult;
  onRetry?: () => void;
  onRegenerate?: (feedback?: string) => void;
}

export const SimulationRenderer: React.FC<SimulationRendererProps> = ({ visualization, onRetry, onRegenerate }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showRegenForm, setShowRegenForm] = useState(false);
  const [userFeedbackInput, setUserFeedbackInput] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [isKilled, setIsKilled] = useState(false);

  const { blueprint, htmlCode, explanation, interactionGuide, status, error } = visualization;
  const typeMeta = VIZ_TYPE_META[blueprint.vizType] || VIZ_TYPE_META.SIMULATION;

  // Inject strict CSP to prevent external network requests (CDNs, tracking)
  const secureHtmlCode = React.useMemo(() => {
    if (!htmlCode) return '';
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`;
    const headRegex = /<\s*head[^>]*>/i;
    if (headRegex.test(htmlCode)) {
      return htmlCode.replace(headRegex, (match) => `${match}\n${cspMeta}`);
    }
    return `${cspMeta}\n${htmlCode}`;
  }, [htmlCode]);

  const handleReload = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    setIsKilled(false);
    setIframeKey(prev => prev + 1);
  }, []);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Error timeout — if iframe doesn't load within 10s, show error
  useEffect(() => {
    if (!isLoading || status === 'error') return;
    const timer = setTimeout(() => {
      if (isLoading) {
        setIsLoading(false);
      }
    }, 10000);
    return () => clearTimeout(timer);
  }, [isLoading, iframeKey, status]);

  // Native fullscreen toggle function
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.warn("Native fullscreen failed, using CSS fallback:", err);
        setIsFullscreen(true);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.warn("Failed to exit native fullscreen:", err);
      });
      setIsFullscreen(false);
    }
  };

  // Sync state with browser native fullscreen events (e.g. exit on Esc)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNative = document.fullscreenElement === containerRef.current;
      setIsFullscreen(isNative);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle ESC key to exit fullscreen (as CSS fallback)
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  // ─── GENERATING STATE ───
  if (status === 'generating') {
    return (
      <div className="h-[400px] w-full rounded-[2.5rem] border-2 border-dashed border-indigo-200/50 dark:border-slate-800/80 bg-white/40 dark:bg-slate-900/40 p-6 flex flex-col items-center justify-center text-center backdrop-blur-xl shadow-lg">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4"
        >
          <Sparkles size={28} className="text-white" />
        </motion.div>
        <p className="text-indigo-600 dark:text-indigo-400 font-black tracking-wider text-sm">RE-GENERATING SIMULASI...</p>
        <p className="text-slate-500 text-xs mt-1 font-medium">(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</p>
      </div>
    );
  }

  // ─── ERROR STATE ───
  if (status === 'error' || !htmlCode) {
    return (
      <div className="h-full w-full rounded-3xl border-2 border-rose-200/50 bg-rose-50/50 dark:bg-rose-950/30 dark:border-rose-800/40 p-6 backdrop-blur-xl shadow-lg">
        <div className="flex flex-col items-center justify-center h-full text-center py-8">
          <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center mb-4 border border-rose-200">
            <AlertTriangle size={32} className="text-rose-500" />
          </div>
          <h4 className="font-black text-rose-800 dark:text-rose-300 text-lg mb-2">(╥﹏╥) Gagal Bikin Simulasi</h4>
          <p className="text-rose-600/80 dark:text-rose-400/80 text-sm max-w-sm mb-4">
            {error || 'Terjadi kesalahan saat memproses kode.'}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-500/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              <RotateCcw size={14} strokeWidth={2.5} />
              Coba Lagi (Regenerate)
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderContent = () => (
    <motion.div 
      layout
      ref={containerRef}
      className={`group relative overflow-hidden transition-all duration-500 flex flex-col ${
        isFullscreen 
          ? 'fixed inset-0 z-[100] shadow-2xl rounded-none w-full h-full' 
          : `rounded-[2rem] shadow-xl hover:shadow-2xl ${typeMeta.glow} hover:-translate-y-1 w-full`
      }`}
      style={{
        background: isFullscreen ? '#0f172a' : 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%)',
        backdropFilter: isFullscreen ? 'none' : 'blur(16px)',
        height: isFullscreen ? '100vh' : 'auto'
      }}
    >
      {/* ─── GRADIENT BACKGROUND ─── */}
      <div className={`absolute inset-0 pointer-events-none ${isFullscreen ? 'bg-slate-950' : 'bg-white dark:bg-slate-900'}`} />
      <div className={`absolute inset-0 bg-gradient-to-br ${typeMeta.color} opacity-[0.05] pointer-events-none`} />

      {/* ─── CONTENT CONTAINER ─── */}
      <div className="relative flex flex-col h-full">
        {/* ─── HEADER BAR ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Type Badge */}
            <span className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${typeMeta.color} shadow-sm shadow-indigo-500/20 text-white text-lg`}>
              {typeMeta.icon}
            </span>
            {/* Title */}
            <div>
              <h3 className="font-black text-slate-800 dark:text-slate-100 text-[15px] truncate max-w-[200px] sm:max-w-[300px]">
                {blueprint.concept}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                {typeMeta.label}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0 bg-slate-100/50 dark:bg-slate-800/50 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700/50">
            {/* Guide Toggle */}
            <button
              onClick={() => setShowGuide(!showGuide)}
              className={`p-2 rounded-xl transition-all duration-200 ${
                showGuide 
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30' 
                  : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700'
              }`}
              title="Panduan Interaksi"
            >
              <Info size={16} strokeWidth={2.5} />
            </button>
            {/* Reload */}
            <button
              onClick={handleReload}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-all duration-200"
              title="Muat Ulang"
            >
              <RotateCcw size={16} strokeWidth={2.5} />
            </button>
            {/* Kill Switch */}
            {!isKilled && (
              <button
                onClick={() => { setIsKilled(true); setIsLoading(false); }}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-rose-500 transition-all duration-200 hover:shadow-md hover:shadow-rose-500/30"
                title="Hentikan Paksa (Jika Macet/Lag)"
              >
                <PowerOff size={16} strokeWidth={2.5} />
              </button>
            )}
            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 transition-all duration-200"
              title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}
            >
              {isFullscreen ? <Minimize2 size={16} strokeWidth={2.5} /> : <Maximize2 size={16} strokeWidth={2.5} />}
            </button>
            {/* Regenerate / Edit with AI */}
            {onRegenerate && !isFullscreen && (
              <button
                onClick={() => setShowRegenForm(!showRegenForm)}
                className={`p-2 rounded-xl transition-all duration-200 ${
                  showRegenForm 
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30' 
                    : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700'
                }`}
                title="Sempurnakan / Edit dengan AI"
              >
                <Sparkles size={16} strokeWidth={2.5} />
              </button>
            )}
            {/* Close fullscreen */}
            {isFullscreen && (
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-rose-500 transition-all duration-200"
                title="Tutup"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* ─── INTERACTION GUIDE BANNER ─── */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden bg-indigo-50/90 dark:bg-indigo-950/60 backdrop-blur-md"
            >
              <div className="px-5 py-3 border-b border-indigo-100/50 dark:border-indigo-800/50 flex items-start gap-3">
                <span className="text-xl">💡</span>
                <p className="text-xs sm:text-sm text-indigo-800 dark:text-indigo-300 font-medium leading-relaxed">
                  <strong className="font-black block mb-0.5">Cara Memainkan:</strong>
                  {interactionGuide}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── REGENERATE FEEDBACK BANNER ─── */}
        <AnimatePresence>
          {showRegenForm && !isFullscreen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200/80 dark:border-slate-700/50 backdrop-blur-md"
            >
              <div className="px-5 py-4 flex flex-col gap-3">
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles size={12} />
                  Sempurnakan / Edit Visualisasi Ini
                </span>
                <textarea
                  value={userFeedbackInput}
                  onChange={(e) => setUserFeedbackInput(e.target.value)}
                  placeholder="Tulis instruksi perbaikan (contoh: 'ubah warna latar belakang simulasi menjadi biru gelap dan tambahkan tombol atur kecepatan')"
                  className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-16"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowRegenForm(false); setUserFeedbackInput(''); }}
                    className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-all"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      if (onRegenerate) {
                        onRegenerate(userFeedbackInput);
                        setShowRegenForm(false);
                      }
                    }}
                    className="px-4 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1.5"
                  >
                    <Sparkles size={11} />
                    Regenerasi
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── IFRAME CONTAINER ─── */}
        <div className={`relative bg-slate-900 ${isFullscreen ? 'flex-grow min-h-0' : ''}`} style={{ minHeight: isFullscreen ? '0' : '400px' }}>
          {/* Loading Skeleton */}
          {isLoading && !isKilled && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-md">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-4"
              >
                <Sparkles size={28} className="text-white" />
              </motion.div>
              <p className="text-indigo-300 font-black tracking-wider text-sm">MEMBANGUN SIMULASI...</p>
              <p className="text-slate-400 text-xs mt-1 font-medium">(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</p>
            </div>
          )}

          {/* Killed State */}
          {isKilled ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md p-6 text-center">
              <div className="w-20 h-20 rounded-full bg-rose-950 flex items-center justify-center mb-4 border-2 border-rose-500/50">
                <PowerOff size={32} className="text-rose-500" />
              </div>
              <p className="text-rose-400 text-lg font-black mb-1">Simulasi Dihentikan Paksa</p>
              <p className="text-slate-400 text-sm mb-6">(✕_✕)</p>
              <button 
                onClick={handleReload}
                className="px-6 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-rose-500/30"
              >
                Muat Ulang Simulasi
              </button>
            </div>
          ) : (
            /* The Sandboxed Iframe */
            <iframe
              key={iframeKey}
              ref={iframeRef}
              sandbox="allow-scripts"
              srcDoc={secureHtmlCode}
              title={`Visualisasi: ${blueprint.concept}`}
              onLoad={handleIframeLoad}
              onError={() => { setHasError(true); setIsLoading(false); }}
              style={{
                border: 'none',
                width: '100%',
                height: isFullscreen ? '100%' : '400px',
                display: 'block',
                backgroundColor: '#0f172a',
              }}
            />
          )}
        </div>

        {/* ─── FOOTER: EXPLANATION ─── */}
        <div className="px-5 py-4 bg-white/60 dark:bg-slate-900/60 border-t border-slate-200/50 dark:border-slate-800">
          <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            <span className="font-bold text-indigo-600 dark:text-indigo-400 mr-2">📝 Penjelasan:</span>
            {explanation}
          </p>
        </div>
      </div>
    </motion.div>
  );

  return (
    <>
      {renderContent()}
      {/* Fullscreen Backdrop */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99] bg-slate-950/90 backdrop-blur-xl"
            onClick={toggleFullscreen}
          />
        )}
      </AnimatePresence>
    </>
  );
};
