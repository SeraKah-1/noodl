import { getLocale, t } from '../services/i18n';
import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { useHandGesture } from '../hooks/useHandGesture';
import { Camera, Hand } from 'lucide-react';
import { DwellIndicator } from './DwellIndicator';

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

  const metaFor = (g: string | null) => {
    if (!g) return { glyph: '', title: '', tone: 'violet' as const, kind: '' };
    if (g === 'NEXT')
      return {
        glyph: '→',
        title: id ? 'Lanjut' : 'Next',
        tone: 'indigo' as const,
        kind: t('navNavigate'),
      };
    if (g === 'BACK')
      return {
        glyph: '←',
        title: id ? 'Kembali' : 'Back',
        tone: 'indigo' as const,
        kind: t('navNavigate'),
      };
    if (['1', '2', '3', '4'].includes(g)) {
      const letter = ['A', 'B', 'C', 'D'][parseInt(g, 10) - 1];
      return {
        glyph: letter,
        title: id ? `Pilihan ${letter}` : `Option ${letter}`,
        tone: 'violet' as const,
        kind: t('navChoice'),
      };
    }
    return { glyph: g, title: g, tone: 'violet' as const, kind: '' };
  };

  const meta = metaFor(detectedGesture);
  const holdHint =
    dwellProgress >= 100
      ? id
        ? 'Terkonfirmasi'
        : 'Confirmed'
      : id
        ? 'Tahan sebentar'
        : 'Hold to confirm';

  const dockStyle: React.CSSProperties = {
    right: 'max(0.75rem, env(safe-area-inset-right))',
    bottom: 'max(5.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))',
  };

  const shell = error ? (
    <div
      className="fixed z-[300] max-w-[15rem] rounded-2xl bg-white/95 border border-rose-100 px-3.5 py-2.5 text-[12px] text-rose-600 shadow-xl font-medium leading-snug"
      style={dockStyle}
    >
      {error}
    </div>
  ) : (
    <div className="fixed z-[300] flex flex-col items-end pointer-events-none gap-2.5" style={dockStyle}>
      <AnimatePresence mode="wait">
        {detectedGesture && (
          <DwellIndicator
            key={detectedGesture}
            progress={dwellProgress}
            glyph={meta.glyph}
            title={meta.title}
            subtitle={`${meta.kind} · ${holdHint}`}
            tone={meta.tone}
            showPercent
          />
        )}
      </AnimatePresence>

      <div className="relative w-[9.5rem] h-[7.25rem] md:w-[12.5rem] md:h-[9.25rem] bg-slate-950 rounded-[1.25rem] overflow-hidden shadow-2xl border border-white/20 pointer-events-auto ring-1 ring-violet-400/30">
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

        <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 z-10">
          <span
            className={`
              text-[10px] font-semibold tracking-tight px-2 py-0.5 rounded-lg
              backdrop-blur-md border border-white/10
              ${
                handPresent
                  ? inRoi
                    ? 'bg-violet-500/90 text-white'
                    : 'bg-amber-500/90 text-white'
                  : 'bg-black/55 text-white/90'
              }
            `}
          >
            {handPresent
              ? inRoi
                ? id
                  ? 'Zona aktif'
                  : 'Active'
                : id
                  ? 'Masuk zona'
                  : 'Enter zone'
              : id
                ? 'Tunjukkan tangan'
                : 'Show hand'}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              handPresent && inRoi ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-white/35'
            }`}
          />
        </div>

        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 to-transparent pt-5 pb-1.5 px-2 z-10">
          <p className="text-[9px] text-white/80 font-medium leading-snug text-center tracking-tight">
            {id ? 'Dalam = input · tepi = diabaikan' : 'Inner = input · edge ignored'}
          </p>
        </div>

        {!isLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-950/92 z-20">
            <Camera className="animate-pulse text-violet-300/90" size={18} />
            <span className="text-[10px] text-slate-300 font-medium flex items-center gap-1 tracking-tight">
              <Hand size={11} /> {id ? 'Memuat…' : 'Loading…'}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(shell, document.body);
};
