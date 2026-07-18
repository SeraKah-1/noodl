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

/**
 * Where Supabase must send the user after Google OAuth.
 * ALWAYS the page origin you started login from (Vercel prod vs localhost).
 *
 * If this URL is NOT in Supabase → Authentication → URL Configuration →
 * Redirect URLs, Supabase falls back to Site URL (often localhost) — that
 * is why Vercel login used to bounce to http://localhost:3000/?error=...
 */
export function oauthRedirect(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  // Trailing slash matches common Supabase allowlist entries
  const origin = window.location.origin.replace(/\/$/, '');
  return `${origin}/`;
}

/** Human message for Supabase OAuth error query params (after Google returns). */
export function explainOAuthUrlError(
  error: string | null,
  errorCode: string | null,
  description: string | null
): string {
  const desc = (description || '').replace(/\+/g, ' ');
  const code = (errorCode || '').toLowerCase();
  const blob = `${error || ''} ${code} ${desc}`.toLowerCase();

  if (
    code === 'flow_state_already_used' ||
    /state has already been used|flow_state/i.test(blob)
  ) {
    const onLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (onLocal) {
      return (
        'Google login was sent to localhost instead of your Vercel site. ' +
        'In Supabase → Authentication → URL Configuration: set Site URL to your Vercel URL ' +
        '(e.g. https://your-app.vercel.app), and add that URL + http://localhost:3000/ under Redirect URLs. ' +
        'Then open the Vercel site and sign in once (do not double-click).'
      );
    }
    return (
      'Login state was already used (double click, back button, or two tabs). ' +
      'Close extra tabs, open the app once, and try Google sign-in again.'
    );
  }

  if (/redirect|url not allowed|invalid redirect/i.test(blob)) {
    return (
      'This site URL is not allowed in Supabase Redirect URLs. ' +
      'Add the exact origin (with trailing slash) under Authentication → URL Configuration.'
    );
  }

  return desc || error || 'Google sign-in failed';
}

/** Cached so SignInScreen + AuthWidget both see the same OAuth error once. */
let _oauthCallbackError: string | null | undefined;

/**
 * Read ?error=… from OAuth redirect, show once, strip from address bar
 * so refresh does not re-surface a dead PKCE state.
 */
export function consumeOAuthCallbackError(): string | null {
  if (typeof window === 'undefined') return null;
  if (_oauthCallbackError !== undefined) return _oauthCallbackError;
  try {
    const url = new URL(window.location.href);
    const err = url.searchParams.get('error');
    const errorCode = url.searchParams.get('error_code');
    const description = url.searchParams.get('error_description');
    if (!err && !errorCode && !description) {
      _oauthCallbackError = null;
      return null;
    }

    const message = explainOAuthUrlError(err, errorCode, description);

    ['error', 'error_code', 'error_description', 'state'].forEach((k) =>
      url.searchParams.delete(k)
    );
    const clean =
      url.pathname +
      (url.searchParams.toString() ? `?${url.searchParams.toString()}` : '') +
      url.hash;
    window.history.replaceState({}, document.title, clean || '/');

    console.warn('[auth] OAuth callback error:', message);
    _oauthCallbackError = message;
    return message;
  } catch {
    _oauthCallbackError = null;
    return null;
  }
}

let _oauthInFlight = false;

/** Google OAuth only (GitHub OAuth and Turnstile removed). */
export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY.');
  }
  if (_oauthInFlight) {
    throw new Error('Sign-in already in progress — wait for redirect.');
  }
  const redirectTo = oauthRedirect();
  if (!redirectTo) {
    throw new Error('Cannot start OAuth without a browser origin.');
  }
  _oauthInFlight = true;
  try {
    console.log('[auth] Google OAuth redirectTo=', redirectTo);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        // Avoid reusing a half-finished consent session that confuses PKCE state
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      _oauthInFlight = false;
      throw error;
    }
    // Browser navigates away on success; leave lock set
  } catch (e) {
    _oauthInFlight = false;
    throw e;
  }
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

/** @deprecated Always null — kept so accidental imports fail closed. */
export function getFirebaseVertexAIModel(_modelId?: string): null {
  return null;
}

export default supabase;
