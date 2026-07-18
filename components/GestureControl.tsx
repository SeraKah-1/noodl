import { getLocale, t } from '../services/i18n';
import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useHandGesture } from '../hooks/useHandGesture';
import { Camera, Hand } from 'lucide-react';

interface GestureControlProps {
  onOptionSelect: (index: number) => void;
  onNext: () => void;
  onPrev: () => void;
  isAnswered: boolean;
}

/**
 * Hand camera HUD is portaled to document.body.
 * Framer Motion parents use `transform`, which would otherwise trap
 * `position: fixed` and park the preview below the fold.
 */
export const GestureControl: React.FC<GestureControlProps> = ({
  onOptionSelect,
  onNext,
  onPrev,
  isAnswered,
}) => {
  const handleTrigger = (gesture: string) => {
    if (gesture === 'BACK') {
      onPrev();
    } else if (gesture === 'NEXT' || (isAnswered && ['1', '2', '3', '4'].includes(gesture))) {
      onNext();
    } else if (!isAnswered) {
      if (gesture === '1') onOptionSelect(0);
      if (gesture === '2') onOptionSelect(1);
      if (gesture === '3') onOptionSelect(2);
      if (gesture === '4') onOptionSelect(3);
    }
  };

  const {
    canvasRef,
    isLoaded,
    error,
    detectedGesture,
    dwellProgress,
    stream,
    inRoi,
    handPresent,
  } = useHandGesture(handleTrigger, false);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const id = getLocale() === 'id';

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => {});
    } else {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
      el.srcObject = null;
    }
  }, [stream]);

  const getGestureLabel = (g: string | null) => {
    if (!g) return '';
    if (g === 'NEXT') return id ? 'LANJUT' : 'NEXT';
    if (g === 'BACK') return id ? 'BALIK' : 'BACK';
    if (['1', '2', '3', '4'].includes(g)) {
      return ['A', 'B', 'C', 'D'][parseInt(g, 10) - 1];
    }
    return g;
  };

  const displayLabel = getGestureLabel(detectedGesture);

  const shell = error ? (
    <div
      className="fixed z-[300] max-w-[14rem] rounded-2xl bg-rose-50/95 border border-rose-100 px-3 py-2 text-[11px] text-rose-700 shadow-lg pointer-events-auto"
      style={{
        right: 'max(0.75rem, env(safe-area-inset-right))',
        bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))',
      }}
    >
      {error}
    </div>
  ) : (
    <div
      className="fixed z-[300] flex flex-col items-end pointer-events-none gap-2"
      style={{
        // Always in the visible viewport (above bottom chrome / safe area)
        right: 'max(0.75rem, env(safe-area-inset-right))',
        bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))',
      }}
    >
      <AnimatePresence>
        {detectedGesture && (
          <motion.div
            initial={{ y: 12, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="bg-white/95 backdrop-blur-xl border border-slate-100 shadow-xl rounded-2xl p-2.5 pr-4 flex items-center gap-3 pointer-events-auto"
          >
            <div className="relative w-11 h-11 flex items-center justify-center bg-slate-50 rounded-full shadow-inner">
              <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle cx="22" cy="22" r="18" stroke="#f1f5f9" strokeWidth="3.5" fill="transparent" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  stroke="#8b5cf6"
                  strokeWidth="3.5"
                  fill="transparent"
                  strokeDasharray={113}
                  strokeDashoffset={113 - (dwellProgress / 100) * 113}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-sm font-bold text-slate-700">{displayLabel}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                {detectedGesture === 'NEXT' || detectedGesture === 'BACK'
                  ? t('navNavigate')
                  : t('navChoice')}
              </span>
              <span className="text-sm font-bold text-slate-700">
                {dwellProgress >= 100
                  ? id
                    ? 'Terkonfirmasi'
                    : 'Confirmed'
                  : id
                    ? 'Tahan…'
                    : 'Hold…'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* object-contain so canvas ROI matches video pixels 1:1 (no cover crop mismatch) */}
      <div className="relative w-[9.5rem] h-[7.25rem] md:w-[13rem] md:h-[9.75rem] bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-violet-400/80 pointer-events-auto ring-2 ring-violet-500/20">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain transform -scale-x-100 bg-black"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain transform -scale-x-100"
        />

        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 z-10">
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow ${
              handPresent
                ? inRoi
                  ? 'bg-violet-600 text-white'
                  : 'bg-amber-500 text-white'
                : 'bg-black/60 text-white'
            }`}
          >
            {handPresent
              ? inRoi
                ? id
                  ? '✓ Di zona aktif'
                  : '✓ Active zone'
                : id
                  ? 'Masuk ke kotak dalam'
                  : 'Enter inner box'
              : id
                ? 'Tunjukkan tangan'
                : 'Show hand'}
          </span>
          <span
            className={`w-2 h-2 rounded-full ring-1 ring-white/40 ${
              handPresent && inRoi ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'
            }`}
          />
        </div>

        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent pt-4 pb-1.5 px-1.5 z-10">
          <p className="text-[8px] md:text-[9px] text-white font-semibold leading-tight text-center">
            {id
              ? 'Zona dalam = input · tepi luar = diabaikan'
              : 'Inner zone = input · outer edge ignored'}
          </p>
        </div>

        {!isLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-900/90 z-20">
            <Camera className="animate-pulse text-violet-300" size={20} />
            <span className="text-[10px] text-violet-100 font-medium flex items-center gap-1">
              <Hand size={12} /> {id ? 'Memuat model…' : 'Loading model…'}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(shell, document.body);
};
