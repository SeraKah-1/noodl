import { create } from 'zustand';
import { AppView, QuizState, Question, QuizResult, ModelConfig, QuizMode } from '../types';
import type { QuizSession } from '../services/quizSessionService';

interface AppState {
  // App Navigation
  currentView: AppView;
  setCurrentView: (view: AppView) => void;

  // Quiz State
  quizState: QuizState;
  setQuizState: (state: QuizState) => void;
  questions: Question[];
  setQuestions: (questions: Question[]) => void;
  originalQuestions: Question[];
  setOriginalQuestions: (questions: Question[]) => void;
  result: QuizResult | null;
  setResult: (result: QuizResult | null) => void;
  activeQuizId: string | number | null;
  setActiveQuizId: (id: string | number | null) => void;
  lastConfig: { files: File[] | null; config: ModelConfig } | null;
  setLastConfig: (config: { files: File[] | null; config: ModelConfig } | null) => void;
  errorMsg: string | null;
  setErrorMsg: (msg: string | null) => void;
  loadingStatus: string;
  setLoadingStatus: (status: string) => void;
  activeMode: QuizMode;
  setActiveMode: (mode: QuizMode) => void;
  resumeSession: QuizSession | null;
  setResumeSession: (session: QuizSession | null) => void;

  // Actions
  resetApp: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial State
  currentView: AppView.GENERATOR,

  quizState: QuizState.CONFIG,
  questions: [],
  originalQuestions: [],
  result: null,
  activeQuizId: null,
  lastConfig: null,
  errorMsg: null,
  loadingStatus: "Ready",
  activeMode: QuizMode.STANDARD,
  resumeSession: null,

  // Setters
  setCurrentView: (view) => set({ currentView: view }),

  setQuizState: (state) => set({ quizState: state }),
  setQuestions: (questions) => set({ questions }),
  setOriginalQuestions: (originalQuestions) => set({ originalQuestions }),
  setResult: (result) => set({ result }),
  setActiveQuizId: (id) => set({ activeQuizId: id }),
  setLastConfig: (config) => set({ lastConfig: config }),
  setErrorMsg: (msg) => set({ errorMsg: msg }),
  setLoadingStatus: (status) => set({ loadingStatus: status }),
  setActiveMode: (mode) => set({ activeMode: mode }),
  setResumeSession: (resumeSession) => set({ resumeSession }),

  resetApp: () => set({
    questions: [],
    originalQuestions: [],
    result: null,
    errorMsg: null,
    activeQuizId: null,
    lastConfig: null,
    resumeSession: null,
    quizState: QuizState.CONFIG,
  }),
}));
