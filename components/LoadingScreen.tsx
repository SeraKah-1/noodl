import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { t, getLocale, subscribeLocale } from '../services/i18n';

interface LoadingScreenProps {
  status?: string;
}

const CHIBI = () => {
  const keys = [
    'loadingChibi1','loadingChibi2','loadingChibi3','loadingChibi4',
    'loadingChibi5','loadingChibi6','loadingChibi7','loadingChibi8',
  ] as const;
  const faces = [
    '( ◕ ‿ ◕ )', '( ╯°□°)╯ ┻━┻', '┬─┬ ノ( ゜-゜ノ)', '( 〜 ￣ ▽ ￣ )〜',
    '( ; ; ; * _ * )', '( ✧ ω ✧ )', '( ˘ ɜ ˘ )', '( •_• )',
  ];
  const colors = [
    'from-blue-200 to-indigo-200','from-red-200 to-orange-200','from-emerald-200 to-teal-200','from-purple-200 to-pink-200',
    'from-slate-200 to-gray-300','from-amber-200 to-yellow-200','from-sky-200 to-cyan-200','from-indigo-200 to-violet-200',
  ];
  return keys.map((k, i) => ({
    face: faces[i],
    color: colors[i],
    message: t(k),
    scale: 1,
  }));
};

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ status }) => {
  const [idx, setIdx] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => subscribeLocale(() => tick(n => n + 1)), []);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % 8), 2200);
    return () => clearInterval(id);
  }, []);
  const states = CHIBI();
  const s = states[idx % states.length];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50/40 p-6">
      <motion.div
        key={s.face + getLocale()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: s.scale, opacity: 1 }}
        className={`text-4xl md:text-5xl font-black tracking-widest bg-gradient-to-br ${s.color} w-28 h-28 flex items-center justify-center rounded-full shadow-lg mb-6`}
      >
        {s.face}
      </motion.div>
      <p className="text-slate-600 font-medium text-center mb-2 italic">{s.message}</p>
      <p className="text-sm text-indigo-600 font-bold text-center max-w-sm">
        {status || t('loadingStatusDefault')}
      </p>
    </div>
  );
};
