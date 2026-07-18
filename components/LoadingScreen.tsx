import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Star, Heart, Zap, Music, Cloud, Coffee } from 'lucide-react';
import { t, getLocale, subscribeLocale, type Locale } from '../services/i18n';

interface LoadingScreenProps {
  status?: string;
}

type ChibiState = {
  face: string;
  color: string;
  shadow: string;
  message: { en: string; id: string };
  scale: number;
};

/** Static chibi cycle — messages bilingual, faces fixed. */
const CHIBI_STATES: ChibiState[] = [
  {
    face: '( ◕ ‿ ◕ )',
    color: 'from-blue-200 to-indigo-200',
    shadow: 'shadow-indigo-500/30',
    message: { en: 'Excuse me, skimming your notes…', id: 'Permisi, numpang baca materi…' },
    scale: 1,
  },
  {
    face: '( ╯°□°)╯ ┻━┻',
    color: 'from-red-200 to-orange-200',
    shadow: 'shadow-orange-500/30',
    message: { en: 'This chapter is spicy!!', id: 'Materinya susah bangeet!!' },
    scale: 1.1,
  },
  {
    face: '┬─┬ ノ( ゜-゜ノ)',
    color: 'from-emerald-200 to-teal-200',
    shadow: 'shadow-emerald-500/30',
    message: { en: 'Okay calm — putting the table back.', id: 'Eh maaf, kalem kalem…' },
    scale: 1,
  },
  {
    face: '( 〜 ￣ ▽ ￣ )〜',
    color: 'from-purple-200 to-pink-200',
    shadow: 'shadow-pink-500/30',
    message: { en: 'Vibing with your data~', id: 'Vibing sama data kamu~' },
    scale: 1.05,
  },
  {
    face: '( ; ; ; * _ * )',
    color: 'from-slate-200 to-gray-300',
    shadow: 'shadow-slate-500/30',
    message: { en: 'Whoa, lots of pages…', id: 'Buset, banyak banget halamannya…' },
    scale: 0.95,
  },
  {
    face: '( ✧ ω ✧ )',
    color: 'from-amber-200 to-yellow-200',
    shadow: 'shadow-amber-500/30',
    message: { en: 'Found a juicy fact!', id: 'Nemu fakta menarik nih!' },
    scale: 1.1,
  },
  {
    face: '( ˘ ɜ ˘ )',
    color: 'from-sky-200 to-cyan-200',
    shadow: 'shadow-sky-500/30',
    message: { en: 'Chill for a sec…', id: 'Santai dulu gak sih…' },
    scale: 1,
  },
  {
    face: 'ʕ • ᴥ • ʔ',
    color: 'from-orange-100 to-amber-100',
    shadow: 'shadow-orange-400/30',
    message: { en: 'Smart-bear mode on.', id: 'Mode beruang pintar aktif.' },
    scale: 1.05,
  },
  {
    face: '( ¬ ‿ ¬ )',
    color: 'from-lime-200 to-green-200',
    shadow: 'shadow-lime-500/30',
    message: { en: 'Easy peasy (a tiny bit smug).', id: 'Gampang ini mah (sombong dikit).' },
    scale: 1,
  },
  {
    face: '( x _ x )',
    color: 'from-rose-200 to-pink-200',
    shadow: 'shadow-rose-500/30',
    message: { en: 'Overheat… need a fan.', id: 'Overheat… butuh kipas angin.' },
    scale: 0.9,
  },
];

const FLOATING_ICONS = [
  { Icon: Star, color: 'text-yellow-400', left: '12%', top: '48%', size: 28, delay: 0 },
  { Icon: Heart, color: 'text-rose-400', left: '78%', top: '52%', size: 32, delay: 1 },
  { Icon: Zap, color: 'text-amber-400', left: '22%', top: '62%', size: 26, delay: 2 },
  { Icon: Sparkles, color: 'text-indigo-500', left: '68%', top: '44%', size: 30, delay: 0.5 },
  { Icon: Music, color: 'text-pink-400', left: '40%', top: '70%', size: 24, delay: 1.5 },
  { Icon: Cloud, color: 'text-sky-400', left: '85%', top: '66%', size: 36, delay: 2.5 },
  { Icon: Coffee, color: 'text-emerald-600', left: '8%', top: '58%', size: 28, delay: 3 },
] as const;

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ status }) => {
  const [stateIndex, setStateIndex] = useState(0);
  const [locale, setLocale] = useState<Locale>(() => getLocale());

  useEffect(() => subscribeLocale((loc) => setLocale(loc)), []);

  // Cycle chibi faces — rAF-free interval, stable length
  useEffect(() => {
    const interval = setInterval(() => {
      setStateIndex((prev) => (prev + 1) % CHIBI_STATES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  const currentState = CHIBI_STATES[stateIndex];
  const funMessage = currentState.message[locale] || currentState.message.en;
  const statusText = status || t('loadingStatusDefault');

  // Prefer reduced motion for accessibility + cheaper CPU
  const reduceMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[60vh] w-full overflow-hidden px-4">
      {/* Floating icons — fixed positions (no Math.random per render) */}
      {!reduceMotion &&
        FLOATING_ICONS.map((item, i) => (
          <motion.div
            key={i}
            className={`absolute ${item.color} opacity-30 pointer-events-none`}
            style={{ left: item.left, top: item.top, willChange: 'transform, opacity' }}
            initial={false}
            animate={{
              y: [0, -40, 0],
              opacity: [0.2, 0.55, 0.2],
              rotate: [0, 12, -8, 0],
            }}
            transition={{
              duration: 5 + i * 0.35,
              repeat: Infinity,
              delay: item.delay,
              ease: 'easeInOut',
            }}
          >
            <item.Icon size={item.size} />
          </motion.div>
        ))}

      {/* Glass card */}
      <motion.div
        initial={reduceMotion ? false : { scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative z-10 bg-white/50 backdrop-blur-2xl border border-white/60 p-8 sm:p-12 rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl shadow-indigo-500/10 flex flex-col items-center max-w-md text-center w-full"
      >
        {/* Chibi character */}
        <div className="relative h-40 w-40 sm:h-48 sm:w-48 mb-6 flex items-center justify-center">
          {/* Blob body — one continuous bounce; only face swaps */}
          <motion.div
            className={`
              absolute inset-0 rounded-[35%] bg-gradient-to-tr ${currentState.color}
              ${currentState.shadow} shadow-2xl
            `}
            style={{ willChange: 'transform' }}
            animate={
              reduceMotion
                ? { scale: 1 }
                : {
                    y: [0, -14, 0],
                    scale: [1, 1.06, 0.96, 1],
                    rotate: [0, -3, 3, 0],
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 2.2, ease: 'easeInOut', repeat: Infinity }
            }
          >
            <div className="absolute top-6 left-6 w-10 h-6 bg-white/40 rounded-full blur-md -rotate-12" />
            <div className="absolute top-8 left-4 w-3 h-3 bg-white/70 rounded-full blur-[1px]" />
          </motion.div>

          {/* Face swap — AnimatePresence wait avoids double-face flash */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`face-${stateIndex}`}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.7, y: 6 }}
              animate={{ opacity: 1, scale: currentState.scale, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: 0.85, y: -6 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className="relative z-10 text-slate-800 font-black text-3xl sm:text-4xl tracking-widest whitespace-nowrap drop-shadow-sm"
            >
              {currentState.face}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Technical status from generate pipeline */}
        <AnimatePresence mode="wait">
          <motion.h2
            key={statusText}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-base sm:text-lg font-bold text-slate-700 mb-3 uppercase tracking-wide min-h-[1.5rem]"
          >
            {statusText}
          </motion.h2>
        </AnimatePresence>

        {/* Progress bar — CSS animation (cheaper than framer width loop) */}
        <div className="w-full h-3.5 sm:h-4 bg-slate-200/50 rounded-full overflow-hidden mb-6 relative border border-white/50 shadow-inner">
          <div
            className="absolute top-0 left-0 h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-400 via-pink-400 to-purple-400"
            style={{
              animation: reduceMotion ? 'none' : 'noodl-load-bar 1.4s ease-in-out infinite',
              width: reduceMotion ? '55%' : undefined,
            }}
          />
          {!reduceMotion && (
            <div
              className="absolute top-0 left-0 h-full w-16 bg-white/50 skew-x-12 blur-md pointer-events-none"
              style={{ animation: 'noodl-load-shimmer 1.3s linear infinite' }}
            />
          )}
        </div>

        {/* Fun dialogue */}
        <div className="h-12 relative w-full overflow-hidden flex justify-center items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${stateIndex}-${locale}`}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
              className="absolute w-full px-1"
            >
              <p className="text-sm font-semibold text-indigo-600 bg-indigo-50/90 px-5 py-2 rounded-2xl border border-indigo-100 shadow-sm mx-auto inline-block max-w-full">
                “{funMessage}”
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <p className="mt-8 text-[10px] text-slate-500/70 font-bold tracking-[0.3em] uppercase animate-pulse">
        {locale === 'id' ? 'Menyusun soal…' : 'Generating questions…'}
      </p>

      {/* Local keyframes — no global CSS dependency */}
      <style>{`
        @keyframes noodl-load-bar {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(380%); }
        }
        @keyframes noodl-load-shimmer {
          0%   { transform: translateX(-80px); }
          100% { transform: translateX(420px); }
        }
      `}</style>
    </div>
  );
};
