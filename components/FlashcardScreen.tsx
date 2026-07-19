import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, PanInfo, useMotionValue, useTransform } from 'framer-motion';
import { BrainCircuit, Check, HelpCircle, Star, X, Zap } from 'lucide-react';
import { Question, SRSItem } from '../types';
import { processCardReview, addQuestionToSRS } from '../services/srsService';
import { useGameSound } from '../hooks/useGameSound';
import { t } from '../services/i18n';
import { OverlayPortal } from './OverlayPortal';

interface FlashcardScreenProps {
  questions: (Question | SRSItem)[];
  keycardId?: string;
  onClose: () => void;
}

const CardText: React.FC<{ text?: string }> = ({ text = '' }) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <span>
      {parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={index} className="font-bold text-theme-primary">{part.slice(2, -2)}</strong>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </span>
  );
};

const adaptiveTextClass = (text = '') => {
  if (text.length > 320) return 'text-base sm:text-lg';
  if (text.length > 180) return 'text-lg sm:text-xl';
  if (text.length > 90) return 'text-xl sm:text-2xl';
  return 'text-2xl sm:text-3xl lg:text-4xl';
};

export const FlashcardScreen: React.FC<FlashcardScreenProps> = ({ questions, keycardId = 'global', onClose }) => {
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [exitDir, setExitDir] = useState<'left' | 'right' | 'down' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { playClick, playCorrect, playIncorrect, triggerHaptic, playSwipe } = useGameSound();

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);
  const bgOverlayOpacity = useTransform(x, [-150, 0, 150], [0.3, 0, 0.3]);
  const bgOverlayColor = useTransform(x, [-150, 0, 150], [
    'rgba(244, 63, 94, 1)',
    'rgba(0,0,0,0)',
    'rgba(16, 185, 129, 1)',
  ]);
  const rememberedOpacity = useTransform(x, [0, 100], [0, 1]);
  const forgottenOpacity = useTransform(x, [0, -100], [0, 1]);

  const handleNextCard = useCallback(async (rating: 'lupa' | 'sulit' | 'bagus' | 'mudah') => {
    if (!isFlipped || isProcessing) return;
    const currentItem = questions[index];
    if (!currentItem) return;

    setIsProcessing(true);
    if (rating === 'lupa') {
      setExitDir('left');
      playIncorrect();
    } else if (rating === 'mudah' || rating === 'bagus') {
      setExitDir('right');
      playCorrect();
    } else {
      setExitDir('down');
      playClick();
    }
    triggerHaptic();

    const quality = rating === 'lupa' ? 0 : rating === 'sulit' ? 1 : rating === 'mudah' ? 3 : 2;
    if ('item_type' in currentItem) {
      await processCardReview(undefined, currentItem as SRSItem, quality);
    } else {
      const added = await addQuestionToSRS(undefined, keycardId, currentItem);
      if (added) await processCardReview(undefined, added, quality);
    }

    window.setTimeout(() => {
      if (index < questions.length - 1) {
        setIndex((previous) => previous + 1);
        setIsFlipped(false);
        setExitDir(null);
        setIsProcessing(false);
        x.set(0);
      } else {
        onClose();
      }
    }, 180);
  }, [index, isFlipped, isProcessing, keycardId, onClose, playClick, playCorrect, playIncorrect, questions, triggerHaptic, x]);

  const handleFlip = useCallback(() => {
    if (Math.abs(x.get()) < 5) {
      triggerHaptic(5);
      setIsFlipped((previous) => !previous);
    }
  }, [triggerHaptic, x]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!isFlipped) {
      x.set(0);
      return;
    }
    if (info.offset.x > 100 || info.velocity.x > 500) void handleNextCard('mudah');
    else if (info.offset.x < -100 || info.velocity.x < -500) void handleNextCard('lupa');
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setIsFlipped((previous) => !previous);
      }
      if (isFlipped && event.key === 'ArrowLeft') void handleNextCard('lupa');
      if (isFlipped && event.key === 'ArrowRight') void handleNextCard('mudah');
      if (isFlipped && event.key === 'ArrowDown') void handleNextCard('sulit');
      if (isFlipped && event.key === 'ArrowUp') void handleNextCard('bagus');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleNextCard, isFlipped, onClose]);

  if (!questions.length) return null;
  const rawQuestion = questions[index];
  if (!rawQuestion) return null;
  const question = 'item_type' in rawQuestion ? rawQuestion.content as Question : rawQuestion as Question;
  const answer = question.options?.[question.correctIndex] || '';
  const progress = ((index + 1) / questions.length) * 100;

  const ratings = [
    { id: 'lupa' as const, label: 'Lupa', icon: HelpCircle, shell: 'bg-rose-50 border-rose-100 text-rose-500' },
    { id: 'sulit' as const, label: 'Sulit', icon: BrainCircuit, shell: 'bg-amber-50 border-amber-100 text-amber-500' },
    { id: 'bagus' as const, label: 'Bagus', icon: Star, shell: 'bg-blue-50 border-blue-100 text-blue-500' },
    { id: 'mudah' as const, label: 'Mudah', icon: Check, shell: 'bg-emerald-50 border-emerald-100 text-emerald-500' },
  ];

  return (
    <OverlayPortal
      labelledBy="flashcard-title"
      className="fixed inset-0 z-[180] h-[100dvh] overflow-hidden bg-theme-bg/95 font-sans text-theme-text backdrop-blur-3xl grid grid-rows-[auto_minmax(0,1fr)_auto]"
    >
      <motion.div style={{ backgroundColor: bgOverlayColor, opacity: bgOverlayOpacity }} className="absolute inset-0 pointer-events-none z-0" />

      <header className="relative z-20 px-3 pt-3 sm:px-6 sm:pt-5">
        <div className="flex items-center justify-between w-full max-w-2xl mx-auto">
          <button type="button" onClick={onClose} aria-label="Close flashcards" className="p-2 rounded-full hover:bg-theme-text/10 text-theme-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary">
            <X size={24} />
          </button>
          <h2 id="flashcard-title" className="text-sm font-bold uppercase tracking-widest opacity-80">Flashcard</h2>
          <div className="text-xs font-mono opacity-50">{index + 1}/{questions.length}</div>
        </div>
        <div className="w-full max-w-2xl mx-auto mt-3 h-1.5 bg-slate-200/20 rounded-full overflow-hidden">
          <motion.div className="h-full bg-theme-primary" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.24, ease: 'easeOut' }} />
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex items-stretch justify-center px-3 py-3 sm:px-6 sm:py-4">
        <div className="relative h-full min-h-0 w-full max-w-2xl perspective-1000">
          {index < questions.length - 1 && <div className="absolute inset-x-3 inset-y-0 translate-y-2 bg-theme-glass border border-theme-border rounded-[1.75rem] -z-10 opacity-50 blur-[1px]" />}
          <motion.div
            key={index}
            style={{ x, rotate, opacity, touchAction: 'pan-y' }}
            drag={isFlipped ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.65}
            onDragStart={playSwipe}
            onDragEnd={handleDragEnd}
            animate={exitDir === 'left' ? { x: -500, opacity: 0, rotate: -30 } : exitDir === 'right' ? { x: 500, opacity: 0, rotate: 30 } : exitDir === 'down' ? { y: 500, opacity: 0 } : { x: 0, y: 0, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="w-full h-full relative cursor-grab active:cursor-grabbing preserve-3d"
          >
            <motion.div className="absolute top-5 left-5 z-50 border-4 border-emerald-500 text-emerald-500 font-black text-2xl sm:text-4xl px-3 py-1 rounded-xl uppercase tracking-widest -rotate-12 pointer-events-none" style={{ opacity: rememberedOpacity }}>INGAT</motion.div>
            <motion.div className="absolute top-5 right-5 z-50 border-4 border-rose-500 text-rose-500 font-black text-2xl sm:text-4xl px-3 py-1 rounded-xl uppercase tracking-widest rotate-12 pointer-events-none" style={{ opacity: forgottenOpacity }}>LUPA</motion.div>

            <motion.div className="w-full h-full relative" initial={false} animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 280, damping: 24 }} style={{ transformStyle: 'preserve-3d' }} onClick={handleFlip}>
              <div className="absolute inset-0 bg-theme-glass backdrop-blur-xl border border-theme-border rounded-[1.75rem] shadow-2xl grid grid-rows-[auto_minmax(0,1fr)_auto] p-4 sm:p-8 text-center overflow-hidden" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                <div className="mx-auto mb-3 sm:mb-5 p-3 bg-theme-primary/10 text-theme-primary rounded-2xl"><BrainCircuit size={32} /></div>
                <div className={`min-h-0 w-full overflow-y-auto custom-scrollbar px-1 flex ${question.text.length > 180 ? 'items-start' : 'items-center'} justify-center`}>
                  <h3 className={`${adaptiveTextClass(question.text)} font-bold leading-relaxed select-none py-2`}><CardText text={question.text} /></h3>
                </div>
                <p className="mt-3 sm:mt-5 text-[10px] uppercase tracking-[0.2em] text-theme-muted font-bold animate-pulse">{t('tapFlip')}</p>
              </div>

              <div className="absolute inset-0 bg-theme-bg border border-theme-border rounded-[1.75rem] shadow-2xl grid grid-rows-[auto_minmax(0,1fr)_auto] p-4 sm:p-8 overflow-hidden" style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                <div className="flex items-center gap-2 mb-4 opacity-70 border-b border-theme-border pb-4"><Zap size={16} className="text-emerald-500" /><span className="text-xs font-bold uppercase tracking-widest text-theme-muted">Jawaban</span></div>
                <div className="min-h-0 overflow-y-auto custom-scrollbar pr-2 select-none">
                  <h3 className={`${adaptiveTextClass(answer)} font-bold text-emerald-600 mb-4 leading-snug`}>{answer}</h3>
                  <div className={`${(question.explanation?.length || 0) > 500 ? 'text-sm' : 'text-sm sm:text-base'} leading-relaxed text-theme-text/80`}><CardText text={question.explanation} /></div>
                </div>
                <div className="mt-4 pt-4 border-t border-theme-border text-center text-theme-muted text-[10px] uppercase tracking-widest opacity-60">{t('pickRating')}</div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </main>

      <footer className="relative z-50 min-h-[5.25rem] px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <AnimatePresence>
          {isFlipped && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="grid grid-cols-4 gap-2 sm:gap-4 w-full max-w-md mx-auto">
              {ratings.map(({ id, label, icon: Icon, shell }) => (
                <button key={id} type="button" onClick={() => void handleNextCard(id)} disabled={isProcessing} className="flex flex-col items-center gap-1 group disabled:opacity-50 disabled:pointer-events-none">
                  <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-2xl border-2 flex items-center justify-center shadow-sm group-hover:scale-105 group-active:scale-95 transition-transform ${shell}`}><Icon size={24} /></div>
                  <span className={`text-[10px] font-bold uppercase ${shell.split(' ').at(-1)}`}>{label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </OverlayPortal>
  );
};
