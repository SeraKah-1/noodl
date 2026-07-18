import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, LogOut, Cloud, User as UserIcon } from 'lucide-react';
import { auth, signInWithGoogle, logOut, isSupabaseConfigured } from '../supabase';

/**
 * Cloud account chip — Supabase Google auth when configured, else local-only note.
 */
export const AuthWidget: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return auth.onAuthStateChanged((u) => setUser(u));
  }, []);

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e?.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await logOut();
    setUser(null);
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-2xl border border-theme-border bg-theme-glass p-4 text-sm text-theme-muted">
        <div className="flex items-center gap-2 font-bold text-theme-text mb-1">
          <Cloud size={16} /> Local-first mode
        </div>
        Quizzes live in this browser (IndexedDB). Add <code className="text-xs">VITE_SUPABASE_URL</code> +{' '}
        <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> to enable optional cloud sync.
      </div>
    );
  }

  if (user) {
    return (
      <div className="rounded-2xl border border-theme-border bg-theme-glass p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="w-9 h-9 rounded-full" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
              <UserIcon size={16} className="text-indigo-600" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-bold text-theme-text truncate">{user.displayName || 'Noodler'}</div>
            <div className="text-xs text-theme-muted truncate">{user.email}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl"
        >
          <LogOut size={14} /> Out
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-theme-border bg-theme-glass p-4 space-y-3">
      <div className="font-bold text-theme-text">Cloud sync (optional)</div>
      <p className="text-xs text-theme-muted leading-relaxed">
        Sign in to sync quizzes &amp; SRS across devices. You can keep using Noodl fully offline without this.
      </p>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <button
        disabled={busy}
        onClick={handleLogin}
        className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-bold text-sm py-2.5 rounded-xl hover:bg-slate-800 disabled:opacity-60"
      >
        <LogIn size={16} /> {busy ? 'Redirecting…' : 'Continue with Google'}
      </button>
    </div>
  );
};

export default AuthWidget;
