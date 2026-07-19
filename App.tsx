
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfigScreen } from './components/ConfigScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { QuizInterface } from './components/QuizInterface';
import { Navigation } from './components/Navigation';
import { FlashcardScreen } from './components/FlashcardScreen';
import { DynamicIsland } from './components/DynamicIsland';
import { transformToMixed, shuffleOptions } from './services/questionTransformer'; 
import { 
  saveGeneratedQuiz, 
  getApiKey, 
  updateHistoryStats, 
  getSavedQuizzes, 
  deleteQuiz, 
  updateLocalQuizQuestions,
  searchCloudQuiz,
  downloadQuizFromCloud,
  registerNetworkSyncListener,
  flushPendingUploads,
  generateId,
} from './services/storageService'; 
import { createRetentionSequence, NeuroSync } from './services/srsService'; 
import { checkAndTriggerNotification } from './services/notificationService';
import { notifyQuizReady, notifyReviewDue, setupIdleReminders } from './services/kaomojiNotificationService';
import { showErrorNotification } from './services/errorNotificationService';
import { initTheme } from './services/themeService'; 
import { loadSession, clearSession } from './services/quizSessionService';
import { QuizState, Question, QuizResult, ModelConfig, QuizMode, AppView, ExamStyle } from './types';
import { AlertTriangle, Play, RotateCcw, X as XIcon } from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { auth, isSupabaseConfigured } from './supabase';
import { onSignedIn, onSignedOut } from './services/syncService';
// auth.onAuthStateChanged provided by supabase shim

import { useAutoSave } from './hooks/useAutoSave';
import { OnboardingModal } from './components/OnboardingModal';
import { getLocale, isOnboardingDone, t, subscribeLocale } from './services/i18n';
import { notifyUser } from './services/uiFeedbackService';
import { validateQuizImport } from './services/quizImportValidation';
import { lazyWithRetry } from './utils/lazyWithRetry';

const SettingsScreen = lazyWithRetry(
  () => import('./components/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
  'SettingsScreen'
);
const HistoryScreen = lazyWithRetry(
  () => import('./components/HistoryScreen').then((m) => ({ default: m.HistoryScreen })),
  'HistoryScreen'
);
const NeuroSyncDashboard = lazyWithRetry(
  () => import('./components/NeuroSyncDashboard').then((m) => ({ default: m.NeuroSyncDashboard })),
  'NeuroSyncDashboard'
);
const MixRoom = lazyWithRetry(
  () => import('./components/MixRoom').then((m) => ({ default: m.MixRoom })),
  'MixRoom'
);
const ResultScreen = lazyWithRetry(
  () => import('./components/ResultScreen').then((m) => ({ default: m.ResultScreen })),
  'ResultScreen'
);
const HubStudyToolPage = lazyWithRetry(
  () => import('./components/HubStudyToolPage').then((m) => ({ default: m.HubStudyToolPage })),
  'HubStudyToolPage'
);

/** Noodl is BYOK-only — no built-in Vertex/Firebase free path. */
const App: React.FC = () => {
  const {
    currentView, setCurrentView,
    quizState, setQuizState,
    questions, setQuestions,
    originalQuestions, setOriginalQuestions,
    result, setResult,
    activeQuizId, setActiveQuizId,
    lastConfig, setLastConfig,
    errorMsg, setErrorMsg,
    loadingStatus, setLoadingStatus,
    activeMode, setActiveMode,
    setResumeSession,
    resetApp
  } = useAppStore();

  const [authLoading, setAuthLoading] = useState(true);

  // ── EXIT CONFIRMATION STATE ──
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const exitStayButtonRef = React.useRef<HTMLButtonElement>(null);
  // ── RESUME SESSION STATE ──
  const [pendingSession, setPendingSession] = useState<any>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [, setLocaleTick] = useState(0);

  useAutoSave();

  useEffect(() => {
    if (!showExitConfirm) return;
    exitStayButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowExitConfirm(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showExitConfirm]);

  useEffect(() => {
    document.documentElement.lang = getLocale();
    const unsub = subscribeLocale(() => setLocaleTick((n) => n + 1));
    if (!isOnboardingDone()) {
      const tmr = setTimeout(() => setShowOnboarding(true), 450);
      return () => {
        clearTimeout(tmr);
        unsub();
      };
    }
    return unsub;
  }, []);

  useEffect(() => {
    initTheme();
    checkAndTriggerNotification();
    registerNetworkSyncListener();

    // Background Checker for Due Items & Study Reminder
    const intervalId = setInterval(async () => {
       checkAndTriggerNotification();
       // Check SRS Due
       try {
         const items = await NeuroSync.getDueItems(null, "global");
         if (items && items.length > 5) {
             const lastSrsNotify = localStorage.getItem('srs_last_notify_date');
             const todayStr = new Date().toDateString();
             if (lastSrsNotify !== todayStr) {
                notifyReviewDue(items.length);
                localStorage.setItem('srs_last_notify_date', todayStr);
             }
         }
       } catch (e) {
           console.log("Check SRS background error:", e);
       }
       // Periodically retry pending uploads
       flushPendingUploads().catch(e => console.log("Flush pending background error:", e));
    }, 60000); // Check every minute

    // Auth: fires only on real identity change (see supabase.ts).
    // Login → one background pull. Never re-subscribe full sync on token refresh.
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setAuthLoading(false);
        console.log('[auth] signed in — local UI ready; cloud pull in background');
        onSignedIn().catch((e) => console.warn('[auth] cloud pull', e));
      } else {
        onSignedOut();
        setAuthLoading(false);
      }
    });

    // Permission is requested only from the explicit Settings action.
    const cleanupIdleReminders = setupIdleReminders();

    // ── CHECK FOR RESUMABLE SESSION ──
    loadSession().then(async (session) => {
      if (session) {
        try {
          const savedQuizzes = await getSavedQuizzes();
          const sourceQuiz = savedQuizzes.find((q: any) => String(q.id) === String(session.quizId));
          if (sourceQuiz && sourceQuiz.questions && sourceQuiz.questions.length > 0) {
            setPendingSession({ session, quiz: sourceQuiz });
          } else {
            // Source quiz was deleted, clear stale session
            clearSession();
          }
        } catch (e) {
          console.error('[Session] Failed to load source quiz:', e);
          clearSession();
        }
      }
    });

    // Check shared quiz link
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    if (shareId) {
       searchCloudQuiz(shareId).then((quiz: any) => {
           if (quiz) {
               downloadQuizFromCloud(quiz).then((downloaded) => {
                   setQuestions(downloaded.questions);
                   setOriginalQuestions(downloaded.questions);
                   setActiveQuizId(downloaded.id);
                   setActiveMode(downloaded.mode || QuizMode.STANDARD);
                   setQuizState(QuizState.QUIZ_ACTIVE);
                   setCurrentView(AppView.GENERATOR);
                   // Clean up URL
                   window.history.replaceState({}, document.title, window.location.pathname);
               });
           }
       }).catch((err) => {
           notifyUser(t('loadQuizFailed') + ': ' + err.message, 'error');
       });
    }

    return () => {
        unsubscribe();
        onSignedOut();
        clearInterval(intervalId);
        cleanupIdleReminders();
    };
  }, []);

  const startQuizGeneration = async (files: File[] | null, config: ModelConfig) => {
    const apiKey = getApiKey(config.provider);
    if (!apiKey) {
      showErrorNotification({
        title: t('genStartFailed'),
        action: "startQuizGeneration",
        whatHappened: t('genCancelled'),
        error: "API key missing (BYOK)",
        possibleCauses: [
          t('genNeedKey'),
          'Settings → AI providers → paste key for the selected provider, Save.',
        ]
      });
      return;
    }

    const fileCount = files ? files.length : 0;
    
    // SAFETY CHECK: File Size
    if (files) {
       const totalSize = Array.from(files).reduce((acc, f) => acc + f.size, 0);
       if (totalSize > 50 * 1024 * 1024) { // 50MB hard limit
          showErrorNotification({
            title: t('docProcessFailed'),
            action: "startQuizGeneration.fileSizeValidation",
            whatHappened: t('fileOverLimit'),
            error: `Total file size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
            possibleCauses: [
              t('tooManyFiles'),
              t('fileTooBig'),
            ]
          });
          return;
       }
    }

    const hasLibrary = config.libraryContext && config.libraryContext.length > 0;
    
    setLoadingStatus(hasLibrary ? t('readingLibrary') : (fileCount > 0 ? t('readingDocs').replace('{n}', String(fileCount)) : t('analyzingTopic')));
    setQuizState(QuizState.PROCESSING); 
    setErrorMsg(null);
    setActiveMode(config.mode);
    setLastConfig({ files, config }); 

    setTimeout(async () => {
        try {
            const { generateQuiz } = await import('./services/geminiService');
          let generatedQuestions: Question[] = [];
          let finalContext = "";

          // --- GENERATION ROUTING ---
          const result = await generateQuiz(
            apiKey,
            files,
            config.topic,
            config.modelId, 
            config.questionCount, 
            config.mode,
            config.examStyle,
            (status) => setLoadingStatus(status),
            [],
            config.customPrompt,
            config.libraryContext,
            config.conceptMap,
            config.bloomPercentages
          );
          generatedQuestions = result.questions;
          finalContext = result.contextText;
          
          // Cache conceptMap for "Add More" calls
          if (result.conceptMap && result.conceptMap.length > 0) {
            setLastConfig({ files, config: { ...config, conceptMap: result.conceptMap } });
          }
          
          if (!generatedQuestions || generatedQuestions.length === 0) {
            throw new Error(t('noQuestions'));
          }

          // --- APPLY CLIENT-SIDE TRANSFORMATIONS (AST 0 LATENCY) ---
          if (config.enableMixedTypes) {
             setLoadingStatus(t('convertingTypes'));
             generatedQuestions = transformToMixed(generatedQuestions);
          }

          // --- SHUFFLE OPTIONS (NEW) ---
          // Ensure options are randomized immediately after generation
          generatedQuestions = shuffleOptions(generatedQuestions);

          // --- APPLY RETENTION LOGIC ---
          setOriginalQuestions(generatedQuestions); // Save pure unique questions
          
          let playableQuestions = generatedQuestions;
          if (config.enableRetention) {
             setLoadingStatus(t('buildingRetention'));
             // Increase by ~60% (e.g. 10 -> 16 questions)
             playableQuestions = createRetentionSequence(generatedQuestions, 0.6);
          }
          
          setQuestions(playableQuestions);

          notifyQuizReady(playableQuestions.length);

          setLoadingStatus(t('savingQuiz'));
          try {
            const saveFileRef = files && files.length > 0 ? files[0] : null; 
            // Save ONLY ORIGINAL questions to history to save space/sanity
            await saveGeneratedQuiz(saveFileRef, config, generatedQuestions);
            const latest = await getSavedQuizzes();
            if (latest.length > 0) setActiveQuizId(latest[0].id);
          } catch (saveError) {
            console.error("Non-fatal error saving quiz:", saveError);
          }
          
          // CLEAR FILES FROM MEMORY after successful generation to prevent OOM
          setLastConfig({ files: null, config }); 
          
          setQuizState(QuizState.QUIZ_ACTIVE);

        } catch (error: any) {
          console.error("Generation Error:", error);
          const formattedError = showErrorNotification({
            title: t('genFailed'),
            action: "startQuizGeneration.generateQuiz",
            whatHappened: t('genFailedDetail'),
            error
          });
          setErrorMsg(formattedError);
          setQuizState(QuizState.ERROR);
        }
    }, 100);
  };

  const handleAddMoreQuestions = async (count: number) => {
    if (!lastConfig) return;
    setLoadingStatus(t('addingQuestions').replace('{n}', String(count)));
    setQuizState(QuizState.PROCESSING);

    setTimeout(async () => {
        try {
            const existingTexts = originalQuestions.map(q => q.text);
            const { generateQuiz } = await import('./services/geminiService');
            const apiKey = getApiKey(lastConfig.config.provider);
            if (!apiKey) {
              throw new Error("API key missing (BYOK). Set it in Settings → AI providers.");
            }
            let newQuestions: Question[] = [];
            const { files, config } = lastConfig;
            const res = await generateQuiz(
              apiKey, files, config.topic, config.modelId, count, config.mode, config.examStyle,
              (status) => setLoadingStatus(status),
              existingTexts,
              config.customPrompt,
              config.libraryContext,
              config.conceptMap,
              config.bloomPercentages
            );
            newQuestions = res.questions;
            
            // --- TRANSFORM NEW QUESTIONS TOO ---
            if (config.enableMixedTypes) {
               newQuestions = transformToMixed(newQuestions);
            }

            // --- SHUFFLE OPTIONS ---
            newQuestions = shuffleOptions(newQuestions);

            const maxId = Math.max(
              ...(originalQuestions || []).map((q) =>
                typeof q?.id === 'number' ? q.id : Number.parseInt(String(q?.id), 10) || 0
              ),
              0
            );
            const indexedNewQuestions = (newQuestions || []).filter(q => q).map((q, i) => ({ ...q, id: maxId + i + 1 }));
            
            // Merge Originals
            const mergedOriginals = [...(originalQuestions || []), ...indexedNewQuestions];
            setOriginalQuestions(mergedOriginals);
            
            // Merge Playables (Use retention if previously enabled)
            let finalPlayable = mergedOriginals;
            if (config.enableRetention) {
               finalPlayable = createRetentionSequence(mergedOriginals, 0.6);
            }
            
            setQuestions(finalPlayable);
            
            if (activeQuizId) { await updateLocalQuizQuestions(activeQuizId, mergedOriginals); }
            setResult(null); 
            setQuizState(QuizState.QUIZ_ACTIVE); 
      
          } catch (e: any) {
            showErrorNotification({
              title: t('addQuestionsFailed'),
              action: "handleAddMoreQuestions",
              whatHappened: t('addQuestionsDetail'),
              error: e
            });
            setQuestions(originalQuestions); 
            setQuizState(QuizState.RESULTS); 
          }
    }, 100);
  };

  const handleImportQuiz = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      notifyUser(t('importInvalid') + ': maximum file size is 5MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = validateQuizImport(JSON.parse(content));

        setLoadingStatus(t('loading') + '…');
        setQuizState(QuizState.PROCESSING);

        // Save to local history
        await saveGeneratedQuiz(null, {
          provider: importedData.provider,
          modelId: importedData.modelId,
          questionCount: importedData.questions.length,
          mode: importedData.mode,
          examStyle: importedData.examStyle,
          topic: importedData.title,
        }, importedData.questions);

        const latest = await getSavedQuizzes();
        if (latest.length > 0) {
           handleLoadHistory(latest[0]);
        }
        
        notifyUser(t('importOk'), 'success');
      } catch (err: any) {
        showErrorNotification({
          title: t('importFailed'),
          action: "handleImportQuiz",
          whatHappened: t('importFailedDetail'),
          error: err
        });
        setQuizState(QuizState.CONFIG);
      }
    };
    reader.readAsText(file);
  };
  
  const handleLoadHistory = (savedQuiz: any) => {
    const freshQuestions = savedQuiz.questions;
    
    setQuestions(freshQuestions);
    setOriginalQuestions(freshQuestions);
    setActiveMode(savedQuiz.mode);
    setActiveQuizId(savedQuiz.id);
    setErrorMsg(null);
    setResult(null);
    setQuizState(QuizState.QUIZ_ACTIVE);
    
    // Fallback for old history records that might have single string examStyle
    const rawExamStyle = savedQuiz.examStyle || savedQuiz.tags?.find((t:string) => t.startsWith('C'));
    const styles = Array.isArray(rawExamStyle) ? rawExamStyle : (rawExamStyle ? [rawExamStyle] : [ExamStyle.C2_CONCEPT]);

    setLastConfig({
       files: null,
       config: {
         provider: savedQuiz.provider || 'gemini',
         modelId: savedQuiz.modelId,
         questionCount: 10,
         mode: savedQuiz.mode,
         examStyle: styles, // Safe array
         topic: savedQuiz.fileName || savedQuiz.topicSummary || savedQuiz.title || '',
         customPrompt: '',
         // Keep full material so More hub tools (Chat / Viz / Material) stay grounded
         libraryContext: savedQuiz.libraryContext || '',
       }
    });
    setCurrentView(AppView.GENERATOR);
  };

  const handleStartMixer = async (mixedQuestions: Question[]) => {
     // Already handled shuffle/transform in Mix Room logic usually, 
     // but safe to ensure options are randomized here too.
     const mixedAndShuffled = shuffleOptions(mixedQuestions);
     
     // ── FITUR 6: Save mixer as a persistent quiz entry ──
     try {
       const mixerConfig: ModelConfig = {
         provider: 'gemini',
         modelId: 'mixer',
         questionCount: mixedAndShuffled.length,
         mode: QuizMode.STANDARD,
         examStyle: [ExamStyle.C2_CONCEPT],
         topic: t('mixTopic').replace('{n}', String(mixedAndShuffled.length)),
       };
       await saveGeneratedQuiz(null, mixerConfig, mixedAndShuffled);
       const latest = await getSavedQuizzes();
       if (latest.length > 0) setActiveQuizId(latest[0].id);
     } catch (e) {
       console.error('[Mixer] Failed to save mixer quiz:', e);
     }
     
     setQuestions(mixedAndShuffled);
     setOriginalQuestions(mixedAndShuffled);
     setActiveMode(QuizMode.STANDARD);
     setErrorMsg(null);
     setResult(null);
     setLastConfig(null);
     setQuizState(QuizState.QUIZ_ACTIVE);
  };

  
  // NEW: Remix Handler
  const handleRemix = (sourceQuestions: Question[]) => {
     setLoadingStatus('Remixing…');
     setQuizState(QuizState.PROCESSING);
     
     setTimeout(() => {
        // 1. Transform types (MCQ <-> T/F)
        // 2. Shuffle Options (Position)
        // 3. Shuffle Order
        const mixed = transformToMixed(sourceQuestions);
        const shuffledOptions = shuffleOptions(mixed);
        const finalMix = shuffledOptions.sort(() => Math.random() - 0.5);
        
        setQuestions(finalMix);
        setOriginalQuestions(finalMix); 
        setResult(null);
        setQuizState(QuizState.QUIZ_ACTIVE);
     }, 500);
  };
  
  const handleQuizComplete = async (finalResult: QuizResult) => {
    setResult(finalResult);
    setQuizState(QuizState.RESULTS);
    
    // ── FITUR 5: Clear session on quiz complete ──
    clearSession();
    
    if (activeQuizId) {
       const percentage = Math.round((finalResult.correctCount / finalResult.totalQuestions) * 100);
       updateHistoryStats(activeQuizId, percentage);
    }

    // --- AUTO-SYNC WRONG ANSWERS TO SRS ---
    // Will be implemented with Firebase later
  };

  const handleAnswerSubmit = async (questionIndex: number, selectedOption: any, isCorrect: boolean, scoreDelta: number) => {
    // Multiplayer logic removed
  };

  // ── FITUR 5: Decouple exit from reset ──
  // Exit now shows confirmation dialog instead of immediately resetting
  const handleExitQuiz = () => { 
    setShowExitConfirm(true);
  };

  // Called when user confirms they want to leave (progress is saved via QuizInterface auto-save)
  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    setQuizState(QuizState.CONFIG); 
    setCurrentView(AppView.GENERATOR);
    // DON'T call resetApp() — session is saved in QuizInterface
  };

  // Called when user explicitly wants to start over from scratch
  const handleResetFromScratch = () => {
    setShowExitConfirm(false);
    clearSession();
    resetApp();
    setCurrentView(AppView.GENERATOR);
  };

  // Resume a pending session
  const handleResumeSession = () => {
    if (!pendingSession) return;
    const { session, quiz } = pendingSession;
    
    setQuestions(quiz.questions);
    setOriginalQuestions(quiz.questions);
    setActiveQuizId(quiz.id);
    setActiveMode(session.mode || QuizMode.STANDARD);
    setResumeSession(session);
    setErrorMsg(null);
    setResult(null);
    setQuizState(QuizState.QUIZ_ACTIVE);
    setCurrentView(AppView.GENERATOR);
    setPendingSession(null);
  };

  const handleDismissSession = () => {
    clearSession();
    setPendingSession(null);
  };
  
  const handleDeleteActiveQuiz = async () => { 
      if (activeQuizId) { 
          await deleteQuiz(activeQuizId); 
      } 
      resetApp(); 
  };
  
  const handleRetryMistakes = () => {
    if (!result) return;
    const wrongQuestionIds = result.answers.filter(a => !a.isCorrect).map(a => a.questionId);
    
    // Filter from 'questions' (which might contain repeats with unique IDs)
    const mistakesToRetry = questions.filter(q => wrongQuestionIds.includes(q.id));
    
    // Shuffle options again for retry!
    const reshuffledMistakes = shuffleOptions(mistakesToRetry);
    
    if (reshuffledMistakes.length > 0) { setQuestions(reshuffledMistakes); setResult(null); setQuizState(QuizState.QUIZ_ACTIVE); }
  };

  const handleRetryAll = () => { 
      // Retry the exact same session sequence, BUT reshuffle options so they don't memorize "Answer is A"
      const reshuffledQuestions = shuffleOptions(questions);
      setQuestions(reshuffledQuestions); 
      setResult(null); 
      setQuizState(QuizState.QUIZ_ACTIVE); 
  };

  const handleContinueQuiz = () => { if (questions.length > 0) setQuizState(QuizState.QUIZ_ACTIVE); };

  const handleStartFlashcards = (sourceQuestions: Question[], sourceId?: string | number) => {
     setQuestions(sourceQuestions);
     setOriginalQuestions(sourceQuestions);
     setActiveQuizId(sourceId || generateId());
     setQuizState(QuizState.FLASHCARDS);
  };

  const renderContent = () => {
    if (quizState === QuizState.PROCESSING) return <LoadingScreen status={loadingStatus} />;
    
    if (quizState === QuizState.QUIZ_ACTIVE) {
        if (!questions || questions.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="text-6xl mb-4">(;X_X)</div>
                  <h2 className="text-2xl font-bold mb-2 text-rose-600">{t('errorTitle')}</h2>
                  <p className="text-theme-muted mb-6">{t('errorEmptyQuiz')}</p>
                  <button onClick={resetApp} className="px-6 py-2 bg-indigo-500 text-white rounded-xl">{t('backHome')}</button>
                </div>
            );
        }
        
        return (
          <QuizInterface 
            key={questions.map((q) => q.id).join('-')}
            onComplete={handleQuizComplete} 
            onExit={handleExitQuiz}
            onAnswerSubmit={handleAnswerSubmit}
          />
        );
    }

    if (quizState === QuizState.FLASHCARDS) {
        return (
            <FlashcardScreen 
                questions={questions} 
                keycardId={String(activeQuizId || 'global')}
                onClose={handleExitQuiz} 
            />
        );
    }
    
    if (quizState === QuizState.RESULTS && result) {
        return (
            <ResultScreen 
              result={result} 
              questions={originalQuestions} 
              onReset={resetApp} 
              onExitToDashboard={() => {
                resetApp();
                setCurrentView(AppView.NEURO_SYNC);
              }}
              onRetryMistakes={handleRetryMistakes}
              onRetryAll={handleRetryAll}
              onDelete={handleDeleteActiveQuiz}
              onAddMore={lastConfig ? handleAddMoreQuestions : undefined}
              onRemix={handleStartMixer}
              activeQuizId={activeQuizId}
            />
        );
    }
    
    if (quizState === QuizState.ERROR) {
      return (
        <div className="text-center mt-20">
           <div className="bg-red-50/50 backdrop-blur-md border border-red-200 p-8 rounded-3xl inline-block max-w-md">
             <h3 className="text-red-800 text-xl font-medium mb-2">Oops!</h3>
             <p className="text-red-600 mb-6">{errorMsg}</p>
             <button onClick={resetApp} className="px-6 py-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200">{t('back')}</button>
           </div>
        </div>
      );
    }

    switch (currentView) {
      case AppView.SETTINGS: 
        return <SettingsScreen />;
      case AppView.WORKSPACE: 
        return <HistoryScreen onLoadHistory={handleLoadHistory} onStartFlashcards={handleStartFlashcards} onImportQuiz={handleImportQuiz} />; 
      case AppView.VIRTUAL_ROOM: 
        return <MixRoom onStartMix={handleStartMixer} onStartFlashcards={handleStartFlashcards} />;
      case AppView.NEURO_SYNC: 
        return <NeuroSyncDashboard keycardId="global" onExit={() => setCurrentView(AppView.GENERATOR)} />;
      case AppView.CHAT:
      case AppView.VISUALIZATION:
      case AppView.MATERIAL_OVERVIEW: {
        const tool =
          currentView === AppView.CHAT
            ? 'chat'
            : currentView === AppView.VISUALIZATION
              ? 'visualization'
              : 'material';
        const sessionQuestions = questions.length > 0 ? questions : originalQuestions;
        return (
          <HubStudyToolPage
            tool={tool}
            sessionPack={{
              quizId: activeQuizId,
              title:
                lastConfig?.config.topic?.split('\n')[0]?.substring(0, 80) ||
                t('pageMaterialTitle'),
              questions: sessionQuestions,
              result,
              libraryContext: lastConfig?.config.libraryContext || '',
              topic: lastConfig?.config.topic || '',
            }}
            onClose={() => setCurrentView(AppView.GENERATOR)}
            onBindActiveQuiz={(id) => {
              if (id != null) setActiveQuizId(id);
            }}
          />
        );
      }
      case AppView.GENERATOR: 
      default: 
        return (
            <ConfigScreen 
                onStart={startQuizGeneration} 
                onContinue={handleContinueQuiz}
                onStartFlashcards={handleStartFlashcards}
                onOpenWorkspace={() => setCurrentView(AppView.WORKSPACE)}
                hasActiveSession={questions.length > 0 && quizState === QuizState.CONFIG && !result}
            />
        );
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] bg-theme-bg flex flex-col justify-center items-center">
         <div className="animate-pulse flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 mb-4"></div>
            <div className="h-4 w-32 bg-theme-border rounded"></div>
         </div>
      </div>
    );
  }

  const isQuizImmersive =
    quizState === QuizState.QUIZ_ACTIVE || quizState === QuizState.PROCESSING;

  return (
    <div
      className={
        isQuizImmersive
          ? 'min-h-[100dvh] relative transition-colors duration-500'
          : 'min-h-[100dvh] p-4 md:p-8 relative pb-24 transition-colors duration-500'
      }
    >
      {showOnboarding && (
        <OnboardingModal onClose={() => setShowOnboarding(false)} />
      )}
      <DynamicIsland />
      {/* ── RESUME SESSION BANNER ── */}
      <AnimatePresence>
        {pendingSession && quizState === QuizState.CONFIG && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
          >
            <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-2 border-indigo-200 dark:border-indigo-700 rounded-2xl p-5 shadow-2xl shadow-indigo-500/20">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{t('resumeTitle')}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t('resumeBody')} ({pendingSession.session.answers?.length || 0})
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleResumeSession}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                      <Play size={14} /> {t('resumeContinue')}
                    </button>
                    <button
                      onClick={handleDismissSession}
                      className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      <XIcon size={14} /> {t('resumeDiscard')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── EXIT CONFIRMATION DIALOG ── */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowExitConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl max-w-sm w-full rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="exit-quiz-title"
            >
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">⚠️</div>
                <h3 id="exit-quiz-title" className="text-lg font-black text-slate-800 dark:text-slate-100">{t('exitQuizTitle')}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  {t('exitQuizBody')}
                </p>
              </div>
              <div className="space-y-3">
                <button
                  ref={exitStayButtonRef}
                  onClick={() => setShowExitConfirm(false)}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Play size={16} /> {t('exitStay')}
                </button>
                <button
                  onClick={handleConfirmExit}
                  className="w-full py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
                >
                  <XIcon size={16} /> {t('exitSaved')}
                </button>
                <button
                  onClick={handleResetFromScratch}
                  className="w-full py-2.5 text-rose-500 dark:text-rose-400 text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={14} /> {t('restartFromScratch')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={
          isQuizImmersive
            ? 'w-full'
            : 'max-w-7xl mx-auto pt-8'
        }
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView + quizState}
            initial={{ opacity: 0, y: isQuizImmersive ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {quizState !== QuizState.PROCESSING && quizState !== QuizState.QUIZ_ACTIVE && (
        <Navigation currentView={currentView} onChangeView={setCurrentView} />
      )}

    </div>
  );
};

export default App;
