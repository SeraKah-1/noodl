import { getLocale, t } from '../services/i18n';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHandGesture } from '../hooks/useHandGesture';
import { Camera, Hand } from 'lucide-react';

interface GestureControlProps {
  onOptionSelect: (index: number) => void;
  onNext: () => void;
  onPrev: () => void;
  isAnswered: boolean;
}

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

  if (error) {
    return (
      <div className="fixed bottom-6 right-6 z-50 max-w-[14rem] rounded-2xl bg-rose-50/95 border border-rose-100 px-3 py-2 text-[11px] text-rose-700 shadow-lg pointer-events-auto">
        {error}
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none gap-3">
      {/* Feedback bubble */}
      <AnimatePresence>
        {detectedGesture && (
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="bg-white/90 backdrop-blur-xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-2xl p-3 pr-5 flex items-center gap-4 pointer-events-auto"
          >
            <div className="relative w-12 h-12 flex items-center justify-center bg-slate-50 rounded-full shadow-inner">
              <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="#f1f5f9" strokeWidth="4" fill="transparent" />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="#8b5cf6"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray={125}
                  strokeDashoffset={125 - (dwellProgress / 100) * 125}
                  strokeLinecap="round"
                  className="transition-all duration-75 ease-linear"
                />
              </svg>
              <span className="absolute text-sm font-bold text-slate-700">{displayLabel}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">
                {detectedGesture === 'NEXT' || detectedGesture === 'BACK'
                  ? t('navNavigate')
                  : t('navChoice')}
              </span>
              <span className="text-sm font-bold text-slate-700 leading-tight">
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

      {/* Camera feed + soft ROI (corners drawn on canvas; CSS hint label) */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-36 h-28 md:w-52 md:h-40 bg-black/10 backdrop-blur-sm rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/50 pointer-events-auto"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full transform -scale-x-100"
        />

        {/* Live status chip */}
        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1">
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md backdrop-blur-sm ${
              handPresent
                ? inRoi
                  ? 'bg-violet-500/80 text-white'
                  : 'bg-amber-500/80 text-white'
                : 'bg-black/35 text-white/90'
            }`}
          >
            {handPresent
              ? inRoi
                ? id
                  ? 'Di frame'
                  : 'In frame'
                : id
                  ? 'Masukkan ke frame'
                  : 'Move into frame'
              : id
                ? 'Tunjukkan tangan'
                : 'Show hand'}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              handPresent && inRoi ? 'bg-emerald-400 animate-pulse' : 'bg-white/50'
            }`}
          />
        </div>

        {/* Legend — thin, non-blocking */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/55 to-transparent pt-5 pb-1.5 px-2">
          <p className="text-[8px] md:text-[9px] text-white/85 font-medium leading-tight text-center tracking-wide">
            {id
              ? '1–4 jari = A–D · jempol = lanjut · telapak = balik · kepalan = diam'
              : '1–4 fingers = A–D · thumb = next · palm = back · fist = idle'}
          </p>
        </div>

        {!isLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-100/85 backdrop-blur-sm">
            <Camera className="animate-pulse text-slate-500" size={20} />
            <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
              <Hand size={12} /> {id ? 'Memuat model…' : 'Loading model…'}
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
};
