import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Sparkles, Chrome } from 'lucide-react';
import {
  signInWithGoogle,
  isSupabaseConfigured,
  consumeOAuthCallbackError,
  oauthRedirect,
} from '../supabase';

interface SignInScreenProps {
  onBypass?: () => void;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ onBypass }) => {
  const [isLoading, setIsLoading] = useState<'google' | 'guest' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const oauthErr = consumeOAuthCallbackError();
    if (oauthErr) setError(oauthErr);
  }, []);

  const goGoogle = async () => {
    if (isLoading) return;
    setIsLoading('google');
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed');
      setIsLoading(null);
    }
  };

  const guest = async () => {
    if (!onBypass) return;
    setIsLoading('guest');
    setError(null);
    try {
      onBypass();
    } finally {
      setIsLoading(null);
    }
  };

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
          Use your noodle across every device. Sign in with Google to sync quizzes &amp; reviews —
          or stay local as a guest.
        </p>
        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-2xl p-3 mb-3 leading-relaxed">
            {error}
          </div>
        )}

        {isSupabaseConfigured ? (
          <>
            <button
              onClick={goGoogle}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-800 font-bold py-3 rounded-2xl hover:bg-slate-50 disabled:opacity-60 shadow-sm"
            >
              {isLoading === 'google' ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Chrome size={18} />
              )}
              Continue with Google
            </button>
            <p className="text-[10px] text-slate-400 mt-2 text-center font-mono truncate">
              redirect → {typeof window !== 'undefined' ? oauthRedirect() : '…'}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-500 mb-3">
            Cloud auth not configured yet — continue as guest, then add Supabase env vars.
          </p>
        )}

        {onBypass && (
          <button
            onClick={guest}
            disabled={busy}
            className="w-full mt-3 text-sm font-bold text-indigo-600 py-3 rounded-2xl hover:bg-indigo-50 disabled:opacity-60"
          >
            {isLoading === 'guest' ? '…' : 'Continue as guest (local only)'}
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default SignInScreen;
