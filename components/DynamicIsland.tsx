import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, AlertTriangle, Wifi, WifiOff, Sparkles, BrainCircuit } from 'lucide-react';
const db = null;
const disableNetwork = async (_?: any) => {}; const enableNetwork = async (_?: any) => {};
import { useAppStore } from '../store/useAppStore';
import { QuizState } from '../types';

export const DynamicIsland: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'offline'>('idle');
  const { quizState, loadingStatus } = useAppStore();

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setSyncStatus('syncing');
      try {
        if (db) await enableNetwork(db);
        setTimeout(() => setSyncStatus('idle'), 2000);
      } catch (e) {
        setSyncStatus('error');
      }
    };

    const handleOffline = async () => {
      setIsOnline(false);
      setSyncStatus('offline');
      if (db) await disableNetwork(db);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isProcessingQuiz = quizState === QuizState.PROCESSING;

  return (
    <div className="fixed top-4 left-0 right-0 flex justify-center z-[100] pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.div
          key={isProcessingQuiz ? 'processing' : syncStatus}
          initial={{ y: -50, scale: 0.8, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: -20, scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`
            backdrop-blur-md border rounded-full shadow-2xl overflow-hidden flex items-center justify-center pointer-events-auto transition-all duration-300
            ${isProcessingQuiz 
              ? 'bg-indigo-950/90 border-indigo-500/40 text-indigo-200 ring-2 ring-indigo-500/20' 
              : 'bg-black/80 border-white/10 text-white'}
          `}
          style={{ minWidth: isProcessingQuiz ? '220px' : '140px', minHeight: '40px' }}
        >
          {isProcessingQuiz ? (
            <div className="flex items-center px-4 py-2 gap-2 text-xs font-bold text-indigo-300">
              <BrainCircuit size={16} className="animate-pulse text-indigo-400" />
              <span className="font-mono">{loadingStatus || 'AI Memproses Soal...'}</span>
              <Loader2 size={14} className="animate-spin text-indigo-400 ml-1" />
            </div>
          ) : (
            <>
              {syncStatus === 'idle' && (
                <div className="flex items-center px-4 py-2 gap-2">
                  <span className="text-sm font-bold opacity-80">( •_• )</span>
                  <span className="text-xs font-medium text-white/50 border-l border-white/20 pl-2">Noodl</span>
                </div>
              )}

              {syncStatus === 'syncing' && (
                <div className="flex items-center px-4 py-2 gap-2 text-indigo-300">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-xs font-bold">Menyelaraskan...</span>
                </div>
              )}

              {syncStatus === 'offline' && (
                <div className="flex items-center px-4 py-2 gap-2 text-amber-400">
                  <WifiOff size={16} />
                  <span className="text-xs font-bold">Mode Offline Aktif</span>
                </div>
              )}

              {syncStatus === 'error' && (
                <div className="flex items-center px-4 py-2 gap-2 text-rose-400">
                  <AlertTriangle size={16} />
                  <span className="text-xs font-bold">Gagal Sinkronisasi</span>
                </div>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
