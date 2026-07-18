
/**
 * ==========================================
 * QUIZ SESSION PERSISTENCE SERVICE
 * ==========================================
 * Saves/loads active quiz progress to IndexedDB so users
 * can resume after accidental exit or browser crash.
 * 
 * NOTE: This is separate from the quiz history (storageService).
 * A "session" is an in-progress quiz attempt, not a saved quiz.
 */

import { get, set, del } from 'idb-keyval';
import type { QuizMode } from '../types';

const SESSION_IDB_KEY = 'mikir_active_session';

export interface AnswerRecord {
  questionId: number;
  selectedIndex: number;
  textAnswer?: string;
  isCorrect: boolean;
}

export interface QuizSession {
  id: string;                   // Session ID
  quizId: string | number;      // Link to saved quiz
  currentIndex: number;         // Current question index
  answers: AnswerRecord[];      // Answers submitted so far
  lives: number;                // For Survival mode
  streak: number;               // Current streak
  mode: QuizMode;
  startedAt: string;            // ISO timestamp
  lastActiveAt: string;         // ISO timestamp
}

/**
 * Save the current quiz session to IndexedDB.
 * Called on every answer submission for crash-safety.
 */
export async function saveSession(session: QuizSession): Promise<void> {
  try {
    await set(SESSION_IDB_KEY, {
      ...session,
      lastActiveAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[QuizSession] Failed to save session:', err);
  }
}

/**
 * Load the active quiz session from IndexedDB.
 * Returns null if no session exists.
 */
export async function loadSession(): Promise<QuizSession | null> {
  try {
    const session = await get(SESSION_IDB_KEY);
    if (!session) return null;
    
    // Validate session structure
    if (!session.quizId || !session.id || !Array.isArray(session.answers)) {
      console.warn('[QuizSession] Invalid session found, clearing.');
      await del(SESSION_IDB_KEY);
      return null;
    }
    
    // Check if session is stale (older than 7 days)
    const lastActive = new Date(session.lastActiveAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastActive > sevenDaysMs) {
      console.log('[QuizSession] Session expired (>7 days), clearing.');
      await del(SESSION_IDB_KEY);
      return null;
    }
    
    return session as QuizSession;
  } catch (err) {
    console.error('[QuizSession] Failed to load session:', err);
    return null;
  }
}

/**
 * Clear the active session (called when quiz is completed or user explicitly resets).
 */
export async function clearSession(): Promise<void> {
  try {
    await del(SESSION_IDB_KEY);
  } catch (err) {
    console.error('[QuizSession] Failed to clear session:', err);
  }
}

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}
