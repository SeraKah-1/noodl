import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Github, Loader2, Sparkles, Chrome } from 'lucide-react';
import { signInWithGitHub, signInWithGoogle, isSupabaseConfigured } from '../supabase';
import { TurnstileWidget, isTurnstileConfigured, resetTurnstile } from './TurnstileWidget';
import { verifyTurnstileToken } from '../services/turnstileService';

interface SignInScreenProps {
  onBypass?: () => void;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ onBypass }) => {
  const [isLoading, setIsLoading] = useState<'github' | 'google' | 'guest' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const ensureHuman = async () => {
    if (!isTurnstileConfigured) return true;
    const result = await verifyTurnstileToken(turnstileToken);
    if (!result.ok) {
      setError(result.message || 'Complete the human check');
      resetTurnstile();
      setTurnstileToken(null);
      return false;
    }
    return true;
  };

  const go = async (provider: 'github' | 'google') => {
    setIsLoading(provider);
    setError(null);
    try {
      if (!(await ensureHuman())) {
        setIsLoading(null);
        return;
      }
      if (provider === 'github') await signInWithGitHub();
      else await signInWithGoogle();
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed');
      setIsLoading(null);
      resetTurnstile();
      setTurnstileToken(null);
    }
  };

  const guest = async () => {
    if (!onBypass) return;
    setIsLoading('guest');
    setError(null);
    try {
      if (!(await ensureHuman())) {
        setIsLoading(null);
        return;
      }
      onBypass();
    } finally {
      setIsLoading(null);
    }
  };

  const needTurnstile = isTurnstileConfigured && !turnstileToken;
  const busy = !!isLoading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gradient-to-tr from-slate-50 via-indigo-50/30 to-purple-50/40">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white/60 shadow-2xl rounded-3xl p-8"
      >
        <div className="flex items-center gap-2 text-indigo-600 font-black text-2xl mb-2">
          <Sparkles size={22} /> Noodl
        </div>
        <p className="text-slate-600 text-sm mb-6 leading-relaxed">
          Use your noodle across every device. Sign in to sync quizzes &amp; reviews — or stay
          local as a guest.
        </p>
        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

        <TurnstileWidget onToken={setTurnstileToken} className="mb-4" />

        {isSupabaseConfigured ? (
          <div className="space-y-2">
            <button
              onClick={() => go('github')}
              disabled={busy || needTurnstile}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-bold py-3 rounded-2xl hover:bg-slate-800 disabled:opacity-60"
            >
              {isLoading === 'github' ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Github size={18} />
              )}
              Continue with GitHub
            </button>
            <button
              onClick={() => go('google')}
              disabled={busy || needTurnstile}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-800 font-bold py-3 rounded-2xl hover:bg-slate-50 disabled:opacity-60"
            >
              {isLoading === 'google' ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Chrome size={18} />
              )}
              Continue with Google
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 mb-3">
            Cloud auth not configured yet — continue as guest, then add Supabase env vars.
          </p>
        )}

        {onBypass && (
          <button
            onClick={guest}
            disabled={busy || needTurnstile}
            className="w-full mt-3 text-sm font-bold text-indigo-600 py-3 rounded-2xl hover:bg-indigo-50 disabled:opacity-60"
          >
            {isLoading === 'guest' ? 'Checking…' : 'Continue as guest'}
          </button>
        )}

        {needTurnstile && (
          <p className="text-[11px] text-amber-700 mt-3 text-center">Complete the check above to continue</p>
        )}
      </motion.div>
    </div>
  );
};
