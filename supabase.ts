/**
 * Noodl cloud layer — Supabase Auth (GitHub + Google) + session plumbing.
 * Configure VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (never service_role in the browser).
 */
import { createClient, type SupabaseClient, type User as SbUser } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const isSupabaseConfigured = Boolean(url && anon && !url.includes('YOUR_'));

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
      realtime: {
        params: { eventsPerSecond: 5 },
      },
      global: {
        headers: { 'x-noodl-client': 'web' },
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

if (supabase) {
  supabase.auth.getSession().then(({ data }) => {
    _user = data.session?.user ?? null;
    listeners.forEach((cb) => cb(_user));
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    _user = session?.user ?? null;
    listeners.forEach((cb) => cb(_user));
  });
}

export const auth = {
  get currentUser() {
    return mapUser(_user);
  },
  onAuthStateChanged(callback: (user: any) => void) {
    const wrapped: AuthListener = (u) => callback(mapUser(u));
    listeners.add(wrapped);
    wrapped(_user);
    return () => listeners.delete(wrapped);
  },
  async signOut() {
    if (supabase) await supabase.auth.signOut();
    _user = null;
  },
};

export type User = NonNullable<ReturnType<typeof mapUser>>;

function oauthRedirect() {
  if (typeof window === 'undefined') return undefined;
  // support both root and deep links after deploy
  return `${window.location.origin}/`;
}

export async function signInWithGitHub() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: oauthRedirect(),
      scopes: 'read:user user:email',
      queryParams: { prompt: 'consent' },
    },
  });
  if (error) throw error;
}

export async function signInWithGoogle() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: oauthRedirect() },
  });
  if (error) throw error;
}

/** Prefer GitHub (hackathon / dev default), fall back to Google */
export async function signInWithPreferred() {
  return signInWithGitHub();
}

export async function signInWithGoogleToken(_idToken: string, _accessToken?: string) {
  return signInWithPreferred();
}
export async function signInWithDirectGoogleOAuth() {
  return signInWithPreferred();
}
export async function processOAuthRedirectUrl() {
  /* PKCE / hash handled by supabase-js */
}
export async function logOut() {
  await auth.signOut();
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
