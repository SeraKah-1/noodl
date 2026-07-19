import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, FileText, Brain, KeyRound } from 'lucide-react';
import {
  getLocale,
  setLocale,
  setOnboardingDone,
  t,
  type Locale,
} from '../services/i18n';

type Props = {
  onClose: () => void;
};

/**
 * First-run intro: language + 3 short steps. Non-blocking later (Settings can re-open later if needed).
 * Design Motion: modal hierarchy (one focus), serial position (start/end strong), microcopy short.
 */
export const OnboardingModal: React.FC<Props> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const [locale, setLoc] = useState<Locale>(getLocale());
  const skipButtonRef = useRef<HTMLButtonElement>(null);

  const pick = (l: Locale) => {
    setLoc(l);
    setLocale(l);
  };

  const finish = () => {
    setOnboardingDone();
    onClose();
  };

  useEffect(() => {
    skipButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const next = () => {
    if (step >= 2) finish();
    else setStep((s) => s + 1);
  };

  const steps = [
    {
      icon: Sparkles,
      title: t('onboarding1Title', locale),
      body: t('onboarding1Body', locale),
      extra: (
        <div className="flex gap-2 mt-4">
          {[
            { id: 'en' as Locale, label: 'English' },
            { id: 'id' as Locale, label: 'Indonesia' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => pick(opt.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                locale === opt.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      icon: FileText,
      title: t('onboarding2Title', locale),
      body: t('onboarding2Body', locale),
      extra: (
        <div className="mt-4 flex items-center justify-center gap-2 text-indigo-500">
          <FileText size={18} />
          <span className="text-slate-300">→</span>
          <Brain size={18} />
          <span className="text-slate-300">→</span>
          <Sparkles size={18} />
        </div>
      ),
    },
    {
      icon: KeyRound,
      title: t('onboarding3Title', locale),
      body: t('onboarding3Body', locale),
      extra: null,
    },
  ];

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-white/80 p-6 sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="noodl-onboard-title"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-indigo-500' : i < step ? 'w-3 bg-indigo-200' : 'w-3 bg-slate-200'
                }`}
              />
            ))}
          </div>
          <button
            ref={skipButtonRef}
            type="button"
            onClick={finish}
            className="text-xs font-bold text-slate-400 hover:text-slate-600"
          >
            {t('onboardingSkip', locale)}
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
              <Icon size={22} />
            </div>
            <h2 id="noodl-onboard-title" className="text-xl font-black text-slate-900 mb-2">
              {current.title}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">{current.body}</p>
            {current.extra}
          </motion.div>
        </AnimatePresence>

        <button
          type="button"
          onClick={next}
          className="w-full mt-6 py-3 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800"
        >
          {step >= 2 ? t('onboardingDone', locale) : t('onboardingNext', locale)}
        </button>
      </motion.div>
    </div>
  );
};
