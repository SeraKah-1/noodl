/**
 * Noodl cloud layer — Supabase Auth + optional data sync.
 * When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing, everything
 * runs fully local (guest mode). No secrets belong in this file.
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
      },
    })
  : null;

/** @deprecated use isSupabaseConfigured */
export const isFirebaseConfigured = isSupabaseConfigured;

type AuthListener = (user: SbUser | null) => void;

let _user: SbUser | null = null;
const listeners = new Set<AuthListener>();

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

/** Firebase-shaped auth shim so existing screens need minimal edits */
export const auth = {
  get currentUser() {
    if (!_user) return null;
    return {
      uid: _user.id,
      email: _user.email ?? null,
      displayName:
        (_user.user_metadata?.full_name as string | undefined) ||
        (_user.user_metadata?.name as string | undefined) ||
        _user.email ||
        'Noodler',
      photoURL: (_user.user_metadata?.avatar_url as string | undefined) || null,
    };
  },
  onAuthStateChanged(callback: (user: any) => void) {
    const wrapped: AuthListener = (u) => {
      if (!u) {
        callback(null);
        return;
      }
      callback({
        uid: u.id,
        email: u.email ?? null,
        displayName:
          (u.user_metadata?.full_name as string | undefined) ||
          (u.user_metadata?.name as string | undefined) ||
          u.email ||
          'Noodler',
        photoURL: (u.user_metadata?.avatar_url as string | undefined) || null,
      });
    };
    listeners.add(wrapped);
    // immediate
    wrapped(_user);
    return () => listeners.delete(wrapped);
  },
  async signOut() {
    if (supabase) await supabase.auth.signOut();
    _user = null;
  },
};

export type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
}

/** Legacy no-ops kept so old call sites compile */
export async function signInWithGoogleToken(_idToken: string, _accessToken?: string) {
  return signInWithGoogle();
}
export async function signInWithDirectGoogleOAuth() {
  return signInWithGoogle();
}
export async function processOAuthRedirectUrl() {
  /* supabase handles PKCE / hash automatically */
}
export async function logOut() {
  await auth.signOut();
}

/** No Firestore — cloud rows go through supabase client directly */
export const db = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(e: unknown, _op?: OperationType, _path?: string) {
  console.warn('[Noodl cloud]', e);
}

/** Vertex via Firebase AI Logic removed — use provider API keys instead */
export function getFirebaseVertexAIModel(_modelId?: string): null {
  return null;
}

export default supabase;
