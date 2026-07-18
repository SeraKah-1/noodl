import React, { useEffect, useState } from 'react';
import { Github, LogOut, Cloud, User as UserIcon, RefreshCw, Chrome } from 'lucide-react';
import {
  auth,
  signInWithGitHub,
  signInWithGoogle,
  logOut,
  isSupabaseConfigured,
  pingSupabase,
} from '../supabase';
import { runFullSync, getDeviceId, type SyncReport } from '../services/syncService';
import { TurnstileWidget, isTurnstileConfigured, resetTurnstile } from './TurnstileWidget';
import { verifyTurnstileToken } from '../services/turnstileService';

/**
 * Cloud account + cross-device sync controls.
 */
export const AuthWidget: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncReport | null>(null);
  const [health, setHealth] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    return auth.onAuthStateChanged((u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Health of Supabase (sync/auth only) — NOT the AI provider in Settings
    pingSupabase().then((r) =>
      setHealth(
        r.ok
          ? `Sync cloud: ${r.message}`
          : `Sync cloud issue: ${r.message}`
      )
    );
  }, []);

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

  const handleGitHub = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await ensureHuman())) {
        setBusy(false);
        return;
      }
      await signInWithGitHub();
    } catch (e: any) {
      setError(e?.message || 'GitHub sign-in failed');
      setBusy(false);
      resetTurnstile();
      setTurnstileToken(null);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await ensureHuman())) {
        setBusy(false);
        return;
      }
      await signInWithGoogle();
    } catch (e: any) {
      setError(e?.message || 'Google sign-in failed');
      setBusy(false);
      resetTurnstile();
      setTurnstileToken(null);
    }
  };

  const handleLogout = async () => {
    await logOut();
    setUser(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const report = await runFullSync();
      setLastSync(report);
      if (report.errors.length) setError(report.errors.join(' · '));
    } catch (e: any) {
      setError(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-2xl border border-theme-border bg-theme-glass p-4 text-sm text-theme-muted space-y-2">
        <div className="flex items-center gap-2 font-bold text-theme-text">
          <Cloud size={16} /> Local-first mode
        </div>
        <p className="text-xs leading-relaxed">
          Add <code className="text-[11px]">VITE_SUPABASE_URL</code> +{' '}
          <code className="text-[11px]">VITE_SUPABASE_PUBLISHABLE_KEY</code> (see{' '}
          <code className="text-[11px]">.env.example</code> and <code className="text-[11px]">docs/SUPABASE.md</code>).
        </p>
        <p className="text-[11px]">
          Schema: <code>node scripts/apply-schema.mjs</code>
        </p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="rounded-2xl border border-theme-border bg-theme-glass p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
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
              <div className="text-xs text-theme-muted truncate">
                {user.email} · {user.provider || 'oauth'}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl"
          >
            <LogOut size={14} /> Out
          </button>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 text-sm font-bold bg-indigo-50 text-indigo-700 py-2.5 rounded-xl hover:bg-indigo-100 disabled:opacity-60"
        >
          <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing devices…' : 'Sync now (all devices)'}
        </button>

        {lastSync && (
          <p className="text-[11px] text-theme-muted">
            Last sync: push {lastSync.pushed} · pull {lastSync.pulled}
            {lastSync.errors.length ? ` · ${lastSync.errors.length} warnings` : ' · ok'}
          </p>
        )}
        {health && <p className="text-[11px] text-theme-muted">{health}</p>}
        <p className="text-[10px] text-theme-muted/80 font-mono truncate">device {getDeviceId()}</p>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-theme-border bg-theme-glass p-4 space-y-3">
      <div className="font-bold text-theme-text">Cross-device sync</div>
      <p className="text-xs text-theme-muted leading-relaxed">
        Sign in to sync quizzes, library, and Neuro-Sync cards across phones and laptops.
        Offline still works — we merge when you’re back.
      </p>
      {health && <p className="text-[11px] text-theme-muted">{health}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <TurnstileWidget onToken={setTurnstileToken} className="my-1" />
      <button
        disabled={busy || (isTurnstileConfigured && !turnstileToken)}
        onClick={handleGitHub}
        className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white font-bold text-sm py-2.5 rounded-xl hover:bg-slate-800 disabled:opacity-60"
      >
        <Github size={16} /> {busy ? 'Redirecting…' : 'Continue with GitHub'}
      </button>
      <button
        disabled={busy || (isTurnstileConfigured && !turnstileToken)}
        onClick={handleGoogle}
        className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-800 font-bold text-sm py-2.5 rounded-xl hover:bg-slate-50 disabled:opacity-60"
      >
        <Chrome size={16} /> Google
      </button>
    </div>
  );
};

export default AuthWidget;
