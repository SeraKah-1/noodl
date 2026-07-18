import { t } from '../services/i18n';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, ChevronLeft, Hand, Eye, Settings, Power, Trophy, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { QuizResult, QuizMode } from '../types';
import { useGameSound } from '../hooks/useGameSound';
import { GestureControl } from './GestureControl';
import { addToGraveyard } from '../services/storageService';
import { UniversalQuestionCard } from './UniversalQuestionCard'; 
import { NoseTrackingManager } from './NoseTrackingManager';
import confetti from 'canvas-confetti';
import { useExperimentalSettings } from '../contexts/ExperimentalSettingsContext';
import { useCamera } from '../contexts/CameraContext';
import { useAppStore } from '../store/useAppStore';
import { useQuizTimer } from '../hooks/useQuizTimer';
import { saveSession, generateSessionId } from '../services/quizSessionService';

interface QuizInterfaceProps {
  onComplete: (result: QuizResult) => void;
  onExit: () => void;
  onAnswerSubmit?: (questionIndex: number, selectedOption: any, isCorrect: boolean, scoreDelta: number) => void;
}

const getKao = () => ({
  IDLE: { face: "( ◕ ‿ ◕ )", color: "bg-white border-slate-200 text-slate-600", msg: t('focusMsg') },
  THINK: { face: "( . _ . )?", color: "bg-indigo-50 border-indigo-200 text-indigo-500", msg: "Hmm..." },
  CORRECT: [
    { face: "( ✧ ▽ ✧ )", color: "bg-emerald-100 border-emerald-300 text-emerald-600", msg: t('correctMsg') },
    { face: "٩( ◕ ᗜ ◕ )و", color: "bg-teal-100 border-teal-300 text-teal-600", msg: t('niceMsg') },
    { face: "( b ᵔ ▽ ᵔ )b", color: "bg-green-100 border-green-300 text-green-600", msg: t('greatMsg') }
  ],
  WRONG: [
    { face: "( ≧Д≦)", color: "bg-rose-100 border-rose-300 text-rose-600", msg: '✗' },
    { face: "( ; ω ; )", color: "bg-red-100 border-red-300 text-red-600", msg: t('ohNoMsg') },
    { face: "( ◡ _ ◡ )", color: "bg-orange-100 border-orange-300 text-orange-600", msg: "Oops." }
  ],
  STREAK: { face: "( 🔥 ◡ 🔥 )", color: "bg-amber-100 border-amber-300 text-amber-600", msg: "ON FIRE!" },
  SHOCK: { face: "( ⊙ _ ⊙ )", color: "bg-purple-100 border-purple-300 text-purple-600", msg: t('shockMsg') }
});

export const QuizInterface: React.FC<QuizInterfaceProps> = ({ onComplete, onExit, onAnswerSubmit }) => {
  const { questions, activeMode: mode, activeQuizId } = useAppStore();
  const KAO = getKao();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState<any>(null); 
  const [isAnswered, setIsAnswered] = useState(false);
  const [answers, setAnswers] = useState<any[]>([]);
  
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(3);
  
  // ── FITUR 5: Session ID for persistence ──
  const sessionIdRef = useRef(generateSessionId());
  
  const [kaomojiState, setKaomojiState] = useState(KAO.IDLE);
  const [flashType, setFlashType] = useState<'none' | 'success' | 'error'>('none');
  
  const { playCorrect, playIncorrect, playClick, playStreak, playTransition, playNotification } = useGameSound();

  // --- NEW CONTEXT HOOKS ---
  const { isExperimentalEnabled, toggleExperimental } = useExperimentalSettings();
  const { mode: cameraMode, setMode: setCameraMode, forceStop } = useCamera();
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileLeaderboard, setShowMobileLeaderboard] = useState(false);

  // Sync camera mode with experimental settings
  useEffect(() => {
    if (!isExperimentalEnabled && cameraMode !== 'OFF') {
      forceStop();
    }
  }, [isExperimentalEnabled, cameraMode, forceStop]);

  // Leaving the quiz must always release the camera (no stuck LED / open stream)
  useEffect(() => {
    return () => {
      forceStop();
    };
  }, [forceStop]);

  const currentQuestion = questions[currentIndex];
  // Calculate progress for worm bar (width in percentage)
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  useEffect(() => {
    if (!currentQuestion) return;
    const history = answers.find(a => a.questionId === currentQuestion.id);
    if (history) {
        setIsAnswered(true);
        setUserAnswer(history.selectedIndex !== -1 ? history.selectedIndex : history.textAnswer);
    } else {
        setIsAnswered(false);
        setUserAnswer(null);
    }
  }, [currentIndex, questions, answers, currentQuestion?.id]);

  // ── FITUR 5: Auto-save session on every answer ──
  useEffect(() => {
    if (answers.length === 0 || !activeQuizId) return;
    
    saveSession({
      id: sessionIdRef.current,
      quizId: activeQuizId,
      currentIndex,
      answers,
      lives,
      streak,
      mode: mode || QuizMode.STANDARD,
      startedAt: sessionIdRef.current.split('-')[1] ? new Date(parseInt(sessionIdRef.current.split('-')[1])).toISOString() : new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    });
  }, [answers, currentIndex, lives, streak, activeQuizId, mode]);

  const handleAnswerRef = React.useRef<any>(null);
  const { timeLeft, timeLeftRef } = useQuizTimer(currentIndex, isAnswered, (ans, isCorr) => handleAnswerRef.current?.(ans, isCorr));

  const handleAnswer = useCallback((answerInput: any, isCorrect: boolean) => {
    if (isAnswered) return;
    setUserAnswer(answerInput);
    setIsAnswered(true);

    let scoreDelta = 0;

    if (isCorrect) {
      playCorrect();
      setStreak(s => s + 1);
      setFlashType('success');
      
      scoreDelta = 10;
      
      const nextStreak = streak + 1;
      if (nextStreak >= 3) {
         playStreak(nextStreak);
         setKaomojiState(KAO.STREAK);
         confetti({ particleCount: 20 + nextStreak * 5, spread: 40, origin: { y: 0.8 }, colors: ['#fbbf24', '#f59e0b'] });
      } else {
         setKaomojiState(KAO.CORRECT[Math.floor(Math.random() * KAO.CORRECT.length)]);
      }
    } else {
      playIncorrect();
      setStreak(0);
      setFlashType('error');
      setKaomojiState(KAO.WRONG[Math.floor(Math.random() * KAO.WRONG.length)]);
      
      addToGraveyard(currentQuestion);
      if (mode === QuizMode.SURVIVAL) setLives(l => Math.max(0, l - 1));
    }

    if (onAnswerSubmit) {
      onAnswerSubmit(currentIndex, answerInput, isCorrect, scoreDelta);
    }

    setAnswers(prev => {
        const existingIdx = prev.findIndex(a => a.questionId === currentQuestion.id);
        const newEntry = { 
            questionId: currentQuestion.id, 
            selectedIndex: typeof answerInput === 'number' ? answerInput : -1,
            textAnswer: typeof answerInput === 'string' ? answerInput : undefined,
            isCorrect 
        };
        
        if (existingIdx !== -1) {
            const updated = [...prev];
            updated[existingIdx] = newEntry;
            return updated;
        }
        return [...prev, newEntry];
    });
  }, [currentQuestion, streak, mode, playCorrect, playIncorrect, isAnswered, onAnswerSubmit, currentIndex, timeLeftRef]);

  useEffect(() => {
    handleAnswerRef.current = handleAnswer;
  }, [handleAnswer]);

  const finishQuiz = useCallback(() => {
    // FIX: Pad answers array if the quiz finished early (e.g. timeout, survival fail)
    // This prevents ResultScreen from crashing when it tries to map over answers
    const paddedAnswers = [...answers];
    if (paddedAnswers.length < questions.length) {
      for (let i = paddedAnswers.length; i < questions.length; i++) {
        paddedAnswers.push({
          questionId: questions[i]?.id,
          selectedOption: null, // Indicates it was skipped or timed out
          isCorrect: false
        });
      }
    }

    const correctCount = paddedAnswers.filter(a => a.isCorrect).length;
    onComplete({ 
        correctCount, 
        totalQuestions: questions.length, 
        score: Math.round((correctCount / questions.length) * 100), 
        mode, 
        answers: paddedAnswers 
    });
  }, [answers, questions, mode, onComplete]);

  const handleNext = useCallback(() => {
    playTransition();
    if (mode === QuizMode.SURVIVAL && lives === 0) {
       finishQuiz();
       return;
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(p => p + 1);
      setKaomojiState(lives === 1 && mode === QuizMode.SURVIVAL ? KAO.SHOCK : KAO.IDLE);
      setFlashType('none');
    } else {
      finishQuiz();
    }
  }, [currentIndex, questions.length, lives, mode, playTransition, finishQuiz]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
        playTransition();
        setCurrentIndex(p => p - 1);
        setFlashType('none');
    }
  }, [currentIndex, playTransition]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
        // Prevent shortcuts if typing in input (e.g., Fill in Blank)
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        if (e.code === 'ArrowLeft' || e.code === 'Space') {
            if (e.code === 'Space') e.preventDefault(); // Prevent scrolling
            handlePrev();
        }
        if (e.code === 'ArrowRight' && isAnswered) {
            handleNext();
        }
        if (e.key === 'Enter') isAnswered ? handleNext() : null;
        if (!isAnswered && ['1','2','3','4'].includes(e.key) && currentQuestion && currentQuestion.type !== 'FILL_BLANK') {
            const idx = parseInt(e.key) - 1;
            handleAnswer(idx, idx === currentQuestion.correctIndex);
        }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isAnswered, handleNext, handlePrev, handleAnswer, currentQuestion]);

  return (
    /*
     * Full-viewport quiz shell (best practice):
     * - Outer: fixed height = 100dvh, flex column, overflow hidden
     * - Header: shrink-0 (never overlaps content)
     * - Main: flex-1 + overflow-y-auto (only this scrolls)
     * Avoid sticky header inside the same scroller as the question — that
     * always covers the stem when users scroll (or when padding is too small).
     */
    <div className="fixed inset-0 z-20 flex flex-col bg-[#f8f9fa] text-slate-800">
      {/* FLASH LAYER */}
      <div
        className={`pointer-events-none absolute inset-0 z-0 ${
          flashType === 'success' ? 'bg-emerald-50' : flashType === 'error' ? 'bg-rose-50' : 'bg-transparent'
        }`}
        style={{
          opacity: flashType !== 'none' ? 0.55 : 0,
          transition: 'opacity 200ms ease-out',
        }}
      />

      {/* --- HEADER (pinned, not sticky-over-content) --- */}
      <header
        className="relative z-30 shrink-0 w-full border-b border-slate-200/70 bg-[#f8f9fa]/95 backdrop-blur-md"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
        }}
      >
        <div className="mx-auto w-full max-w-4xl px-3 sm:px-4 pb-3 flex items-center gap-2 sm:gap-3">
          {/* LEFT */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onExit}
              className="p-2.5 bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-rose-500 rounded-xl hover:bg-rose-50 transition-all active:scale-95"
              aria-label="Exit quiz"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
            {currentIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                title="Previous"
                className="p-2.5 bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition-all active:scale-95"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* PROGRESS */}
          <div className="flex-1 min-w-0 px-1">
            <div className="h-2 sm:h-2.5 w-full bg-slate-200 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full relative"
                style={{
                  width: `${progress}%`,
                  transition: 'width 350ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </div>
            <div className="text-center mt-1 text-[10px] font-semibold text-slate-500 tracking-wide tabular-nums">
              {t('questionOf')
                .replace('{cur}', String(currentIndex + 1))
                .replace('{total}', String(questions.length))}
            </div>
          </div>

          {/* RIGHT tools */}
          <div className="relative flex items-center gap-1.5 shrink-0">
            {mode === QuizMode.SURVIVAL && (
              <div
                className={`flex items-center font-bold px-2 py-1 rounded-lg text-[11px] border ${
                  lives === 1
                    ? 'bg-rose-500 text-white border-rose-600'
                    : 'bg-white text-rose-500 border-rose-100 shadow-sm'
                }`}
              >
                <Heart
                  size={12}
                  className={`mr-1 ${lives === 1 ? 'fill-white' : 'fill-rose-500'}`}
                />
                {lives}
              </div>
            )}
            {mode === QuizMode.TIME_RUSH && (
              <div
                className={`flex items-center font-bold px-2.5 py-1 rounded-lg text-[11px] border tabular-nums ${
                  timeLeft <= 5
                    ? 'bg-rose-500 text-white border-rose-600'
                    : 'bg-white text-indigo-600 border-indigo-100 shadow-sm'
                }`}
              >
                <Clock size={12} className="mr-1" />
                {timeLeft}s
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-xl border shadow-sm transition-all active:scale-95 ${
                showSettings
                  ? 'bg-slate-800 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:text-slate-600'
              }`}
            >
              <Settings size={16} strokeWidth={2.5} />
            </button>

            {isExperimentalEnabled && (
              <div className="hidden sm:flex items-center gap-0.5 bg-white p-0.5 rounded-xl border border-slate-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => setCameraMode(cameraMode === 'NOSE' ? 'OFF' : 'NOSE')}
                  className={`p-2 rounded-lg transition-all ${
                    cameraMode === 'NOSE'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                  title="Nose tracking"
                  aria-pressed={cameraMode === 'NOSE'}
                >
                  <Eye size={15} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => setCameraMode(cameraMode === 'HAND' ? 'OFF' : 'HAND')}
                  className={`p-2 rounded-lg transition-all ${
                    cameraMode === 'HAND'
                      ? 'bg-purple-500 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                  title="Hand gesture"
                  aria-pressed={cameraMode === 'HAND'}
                >
                  <Hand size={15} strokeWidth={2.5} />
                </button>
                {cameraMode !== 'OFF' && (
                  <button
                    type="button"
                    onClick={() => forceStop()}
                    className="px-1.5 py-1 rounded-lg text-rose-500 hover:bg-rose-50 text-[9px] font-bold uppercase"
                    title="Force stop camera"
                  >
                    Off
                  </button>
                )}
              </div>
            )}

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-50"
                >
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Advanced
                  </h3>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-1.5 rounded-lg ${
                          isExperimentalEnabled
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <Power size={14} strokeWidth={3} />
                      </div>
                      <span className="text-sm font-bold text-slate-700">Hands-free lab</span>
                    </div>
                    <button
                      type="button"
                      onClick={toggleExperimental}
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        isExperimentalEnabled ? 'bg-indigo-500' : 'bg-slate-200'
                      }`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                          isExperimentalEnabled ? 'left-5' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                  {isExperimentalEnabled && (
                    <div className="flex sm:hidden items-center gap-1 mt-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setCameraMode(cameraMode === 'NOSE' ? 'OFF' : 'NOSE')}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                          cameraMode === 'NOSE'
                            ? 'bg-emerald-500 text-white border-emerald-600'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Nose
                      </button>
                      <button
                        type="button"
                        onClick={() => setCameraMode(cameraMode === 'HAND' ? 'OFF' : 'HAND')}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                          cameraMode === 'HAND'
                            ? 'bg-purple-500 text-white border-purple-600'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        Hand
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Off by default. Nose / hand stay on-device and use more battery.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* --- SCROLLABLE QUESTION AREA (full remaining height) --- */}
      <main
        data-quiz-scroll
        className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Feedback chip in-flow (never covers question stem) */}
        <div className="flex justify-center pt-3 pb-1 pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={kaomojiState.face + String(isAnswered) + streak}
              initial={{ scale: 0.92, opacity: 0, y: -4 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={`
                flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-sm bg-white/95
                ${kaomojiState.color}
              `}
            >
              <span className="text-sm font-bold tracking-wide">{kaomojiState.face}</span>
              {(isAnswered || streak >= 3) && (
                <span className="text-[10px] font-semibold uppercase border-l border-current/20 pl-2">
                  {streak >= 3 && !isAnswered ? `${streak} COMBO!` : kaomojiState.msg}
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="w-full max-w-2xl mx-auto px-4 sm:px-5 pt-2 pb-24">
          <AnimatePresence mode="wait">
            {currentQuestion && (
              <UniversalQuestionCard
                key={`${currentQuestion.id}-${currentIndex}`}
                question={currentQuestion}
                isAnswered={isAnswered}
                userAnswer={userAnswer}
                onAnswer={handleAnswer}
                onNext={handleNext}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      {isExperimentalEnabled && cameraMode === 'HAND' && (
        <GestureControl
          onOptionSelect={(idx) => handleAnswer(idx, idx === currentQuestion.correctIndex)}
          onNext={handleNext}
          onPrev={handlePrev}
          isAnswered={isAnswered}
        />
      )}

      {isExperimentalEnabled && cameraMode === 'NOSE' && (
        <NoseTrackingManager
          onOptionSelect={(idx) => handleAnswer(idx, idx === currentQuestion.correctIndex)}
          onNext={handleNext}
          onPrev={handlePrev}
          isAnswered={isAnswered}
        />
      )}
    </div>
  );
};
