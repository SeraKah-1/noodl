import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, Loader2, Sparkles } from 'lucide-react';
import { signInWithGoogle, isSupabaseConfigured } from '../supabase';

interface SignInScreenProps {
  onBypass?: () => void;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ onBypass }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed');
      setIsLoading(false);
    }
  };

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
          Turn messy notes into high-yield quizzes. Remember them with spaced repetition.
          Optional cloud sync — or stay fully local.
        </p>
        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
        {isSupabaseConfigured ? (
          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-bold py-3 rounded-2xl hover:bg-slate-800 disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
            Continue with Google
          </button>
        ) : (
          <p className="text-xs text-slate-500 mb-3">Cloud auth not configured — continue as guest.</p>
        )}
        {onBypass && (
          <button
            onClick={onBypass}
            className="w-full mt-3 text-sm font-bold text-indigo-600 py-3 rounded-2xl hover:bg-indigo-50"
          >
            Continue as guest
          </button>
        )}
      </motion.div>
    </div>
  );
};
