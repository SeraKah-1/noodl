import { t } from '../services/i18n';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, WifiOff } from 'lucide-react';

export const DynamicIsland: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'online' | 'error' | 'offline'>('idle');

  useEffect(() => {
    let onlineTimer: ReturnType<typeof setTimeout> | undefined;
    const handleOnline = () => {
      setSyncStatus('online');
      clearTimeout(onlineTimer);
      onlineTimer = setTimeout(() => setSyncStatus('idle'), 1200);
    };

    const handleOffline = () => {
      setSyncStatus('offline');
    };

    const onOnline = () => {
      handleOnline();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimeout(onlineTimer);
    };
  }, []);

  return (
    <div aria-live="polite" className="fixed top-4 left-0 right-0 flex justify-center z-40 pointer-events-none">
      <AnimatePresence mode="wait">
        {syncStatus !== 'idle' && <motion.div
          key={syncStatus}
          initial={{ y: -50, scale: 0.8, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: -20, scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`
            backdrop-blur-md border rounded-full shadow-2xl overflow-hidden flex items-center justify-center pointer-events-auto transition-all duration-300
            bg-black/80 border-white/10 text-white
          `}
          style={{ minWidth: '140px', minHeight: '40px' }}
        >
            <>
              {syncStatus === 'online' && (
                <div className="flex items-center px-4 py-2 gap-2 text-indigo-300">
                  <CheckCircle2 size={16} />
                  <span className="text-xs font-bold">Back online</span>
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
                  <span className="text-xs font-bold">{t('syncFailed')}</span>
                </div>
              )}
            </>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
};
