/**
 * Noodl cloud layer — Supabase Auth + browser client.
 *
 * Client uses ONLY the publishable/anon key (RLS enforced).
 * Never put SUPABASE_SECRET_KEY in VITE_* or ship it to the browser.
 */
import { createClient, type SupabaseClient, type User as SbUser } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';

/** Prefer new publishable keys; fall back to legacy anon JWT */
const clientKey = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  ''
).trim();

export const isSupabaseConfigured = Boolean(
  url &&
    clientKey &&
    !url.includes('YOUR_') &&
    !clientKey.includes('YOUR_') &&
    !clientKey.includes('...')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, clientKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
      realtime: {
        params: { eventsPerSecond: 8 },
      },
      global: {
        headers: {
          'x-noodl-client': 'web',
          'x-client-info': 'noodl-web',
        },
      },
      db: {
        schema: 'public',
      },
    })
  : null;

/** @deprecated */
export const isFirebaseConfigured = isSupabaseConfigured;

type AuthListener = (user: SbUser | null) => void;

let _user: SbUser | null = null;
const listeners = new Set<AuthListener>();

function mapUser(u: SbUser | null) {
  if (!u) return null;
  const meta = u.user_metadata || {};
  return {
    uid: u.id,
    id: u.id,
    email: u.email ?? null,
    displayName:
      (meta.full_name as string | undefined) ||
      (meta.name as string | undefined) ||
      (meta.user_name as string | undefined) ||
      (meta.preferred_username as string | undefined) ||
      u.email ||
      'Noodler',
    photoURL:
      (meta.avatar_url as string | undefined) ||
      (meta.picture as string | undefined) ||
      null,
    provider:
      u.app_metadata?.provider ||
      (Array.isArray(u.app_metadata?.providers) ? u.app_metadata.providers[0] : null) ||
      'email',
    raw: u,
  };
}

/**
 * CRITICAL: only notify when identity changes (signed in/out / different uid).
 * TOKEN_REFRESHED and other noise must NOT re-trigger App/History "login sync"
 * (that was the fatal re-entrancy bug: sync "never finished").
 */
function notifyIfIdentityChanged(next: SbUser | null, reason: string) {
  const prevId = _user?.id ?? null;
  const nextId = next?.id ?? null;
  _user = next;
  if (prevId === nextId) {
    // Still update in-memory user (metadata) but do not spam listeners
    if (prevId && next) {
      // no listener fan-out on pure token refresh
      return;
    }
    return;
  }
  console.log(`[auth] identity ${reason}: ${prevId ?? 'out'} → ${nextId ?? 'out'}`);
  listeners.forEach((cb) => cb(_user));
}

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    notifyIfIdentityChanged(data.session?.user ?? null, 'getSession');
  });
  supabase.auth.onAuthStateChange((event, session) => {
    // Ignore token refresh / user updated for app-level lifecycle
    if (event === 'TOKEN_REFRESHED') {
      _user = session?.user ?? _user;
      return;
    }
    notifyIfIdentityChanged(session?.user ?? null, event);
  });
}

export const auth = {
  get currentUser() {
    return mapUser(_user);
  },
  onAuthStateChanged(callback: (user: any) => void) {
    const wrapped: AuthListener = (u) => callback(mapUser(u));
    listeners.add(wrapped);
    // Immediate current snapshot (may be null until getSession resolves)
    wrapped(_user);
    return () => listeners.delete(wrapped);
  },
  async signOut() {
    if (supabase) await supabase.auth.signOut();
    notifyIfIdentityChanged(null, 'signOut');
  },
};

export type User = NonNullable<ReturnType<typeof mapUser>>;

function oauthRedirect() {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/`;
}

/** Google OAuth only (GitHub OAuth and Turnstile removed). */
export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: oauthRedirect() },
  });
  if (error) throw error;
}

export async function signInWithPreferred() {
  return signInWithGoogle();
}

export async function signInWithGoogleToken(_idToken: string, _accessToken?: string) {
  return signInWithGoogle();
}
export async function signInWithDirectGoogleOAuth() {
  return signInWithGoogle();
}
export async function processOAuthRedirectUrl() {
  /* PKCE handled by supabase-js */
}
export async function logOut() {
  await auth.signOut();
}

/** Health check (anon/publishable) — tables must exist + RLS allow or return empty */
export async function pingSupabase(): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: 'Client not configured' };
  try {
    const { error } = await supabase.from('quizzes').select('id').limit(1);
    if (error) {
      // relation missing vs auth
      if (/relation|does not exist|schema cache/i.test(error.message)) {
        return {
          ok: false,
          message: `Schema not applied yet: ${error.message}. Run supabase/schema.sql in SQL Editor.`,
        };
      }
      // empty + RLS is fine when logged out
      if (/JWT|permission|RLS|row-level/i.test(error.message)) {
        return { ok: true, message: 'Reachable (auth/RLS active)' };
      }
      return { ok: false, message: error.message };
    }
    return { ok: true, message: 'Reachable' };
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) };
  }
}

export const db = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(e: unknown) {
  console.warn('[Noodl cloud]', e);
}

export function getFirebaseVertexAIModel(_modelId?: string): null {
  return null;
}

export default supabase;
