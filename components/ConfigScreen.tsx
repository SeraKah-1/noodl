
import React, { useState, useEffect } from 'react';
import { Upload, FileText, Layout, Zap, TrendingUp, Skull, BookOpen, Type, RefreshCw, CheckCircle2, X, PlayCircle, Layers, Settings2, Sparkles, Folder, Target, BrainCircuit, Shuffle, Cpu, ChevronDown, MessageSquarePlus, Check, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModelConfig, QuizMode, ExamStyle, AiProvider, Question, LibraryItem, ModelOption, SRSItem } from '../types';
import {
  getCachedModels,
  getActiveProvider,
  setActiveProvider,
  getActiveModel,
  setActiveModel,
  ensureActiveModelValid,
  PROVIDER_CATALOG,
} from '../services/providerService';
import { GlassButton } from './GlassButton';
import { DashboardMascot } from './DashboardMascot';
import { StudyScheduler } from './StudyScheduler';
import { getLibraryItems, getApiKey } from '../services/storageService';
import { fetchUrlContent } from '../services/fileService';
import { getDueItems } from '../services/srsService';
import { notifyReviewDue } from '../services/kaomojiNotificationService';
import { showErrorNotification } from '../services/errorNotificationService';
import { FlashcardScreen } from './FlashcardScreen';
import { t, subscribeLocale } from '../services/i18n';

interface ConfigScreenProps {
  onStart: (files: File[], config: ModelConfig) => void | Promise<void>;
  onContinue: () => void;
  onStartFlashcards: (questions: Question[], sourceId?: string | number) => void;
  onOpenWorkspace: () => void;
  hasActiveSession: boolean;
}

const getModeCards = () => [
  { id: QuizMode.STANDARD, icon: Layout, label: t('cfgModeStandard'), desc: t('cfgModeStandardDesc'), color: "bg-indigo-50 border-indigo-200 text-indigo-600" },
  { id: QuizMode.SURVIVAL, icon: Skull, label: t('cfgModeSurvival'), desc: t('cfgModeSurvivalDesc'), color: "bg-rose-50 border-rose-200 text-rose-600" },
  { id: QuizMode.TIME_RUSH, icon: Zap, label: t('cfgModeTimeRush'), desc: t('cfgModeTimeRushDesc'), color: "bg-amber-50 border-amber-200 text-amber-600" }
];

const getBloomLevels = () => [
  { id: ExamStyle.C1_RECALL, label: t('cfgBloom1'), desc: t('cfgBloom1d') },
  { id: ExamStyle.C2_CONCEPT, label: t('cfgBloom2'), desc: t('cfgBloom2d') },
  { id: ExamStyle.C3_APPLICATION, label: t('cfgBloom3'), desc: t('cfgBloom3d') },
  { id: ExamStyle.C4_ANALYSIS, label: t('cfgBloom4'), desc: t('cfgBloom4d') },
  { id: ExamStyle.C5_EVALUATION, label: t('cfgBloom5'), desc: t('cfgBloom5d') },
];

export const ConfigScreen: React.FC<ConfigScreenProps> = ({ onStart, onContinue, onStartFlashcards, onOpenWorkspace, hasActiveSession }) => {
  const [inputMethod, setInputMethod] = useState<'library' | 'upload' | 'topic' | 'url'>('library');
  
  // Library State
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  
  // Direct Upload State
  const [files, setFiles] = useState<File[]>([]);
  
  // Manual Topic State
  const [topic, setTopic] = useState(''); 
  
  // URL State
  const [urlInput, setUrlInput] = useState('');

  // Config State
  const [provider, setProvider] = useState<AiProvider>(getActiveProvider());
  const [modelId, setModelId] = useState("");
  const [dynamicModels, setDynamicModels] = useState<ModelOption[]>([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [mode, setMode] = useState<QuizMode>(QuizMode.STANDARD);
  const [examStyles, setExamStyles] = useState<ExamStyle[]>([ExamStyle.C2_CONCEPT]);
  const [bloomPercentages, setBloomPercentages] = useState<Record<string, number>>({
    [ExamStyle.C2_CONCEPT]: 100
  });
  const [customPrompt, setCustomPrompt] = useState('');
  const [enableRetention, setEnableRetention] = useState(false); 
  const [enableMixedTypes, setEnableMixedTypes] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [folder, setFolder] = useState('');
  
  // UI State
  const [dragActive, setDragActive] = useState(false);
  const [dueCards, setDueCards] = useState<SRSItem[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [, setLocaleTick] = useState(0);
  useEffect(() => subscribeLocale(() => setLocaleTick(n => n + 1)), []);

  // Re-sync active provider + global model whenever this screen is shown (Settings is source of truth).
  useEffect(() => {
    const p = getActiveProvider();
    setProvider(p);
    const models = getCachedModels(p);
    setDynamicModels(models);
    setModelId(ensureActiveModelValid(p, models));
  }, []);

  // BYOK only — key must match the *active* provider (no built-in Vertex free path).
  const hasApiKey = !!getApiKey(provider);

  useEffect(() => {
    getLibraryItems().then(setLibraryItems);
    getDueItems().then(items => {
      if (items && items.length > 0) {
        // Preserve SRS metadata so a review updates the existing schedule.
        setDueCards(items);
        notifyReviewDue(items.length);
      }
    });

  }, []);

  // --- DYNAMIC MODEL FETCHING (global Settings model) ---
  useEffect(() => {
    const cached = getCachedModels(provider);
    setDynamicModels(cached);
    setModelId(ensureActiveModelValid(provider, cached));
  }, [provider]);

  const handleProviderChange = (newProvider: AiProvider) => {
      setProvider(newProvider);
      setActiveProvider(newProvider);
      const cached = getCachedModels(newProvider);
      const nextId = ensureActiveModelValid(newProvider, cached);
      setDynamicModels(cached);
      setModelId(nextId);
  };

  const handleModelChange = (id: string) => {
    setModelId(id);
    setActiveModel(provider, id);
    setActiveProvider(provider);
  };

  const handleFilesUpload = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const validFiles = Array.from(newFiles).filter(f => {
      const lowerName = f.name.toLowerCase();
      const isSupportedDoc =
        lowerName.endsWith('.pdf') ||
        lowerName.endsWith('.txt') ||
        lowerName.endsWith('.md');
      const isSupportedImage = f.type.startsWith('image/');
      if (!(isSupportedDoc || isSupportedImage)) {
        showErrorNotification({
          title: t('fileRejected'),
          action: 'handleFilesUpload.unsupportedType',
          whatHappened: `${f.name}: ${t('fileUnsupported')}`,
          error: f.type || 'unknown file type',
        });
        return false;
      }
      if (f.size > 15 * 1024 * 1024) {
        showErrorNotification({
          title: t('fileRejected'),
          action: "handleFilesUpload",
          whatHappened: `${f.name}: ${t('filePerLimit')}`,
          error: `File size ${(f.size / 1024 / 1024).toFixed(2)} MB`
        });
        return false;
      }
      return true;
    });
    setFiles(prev => [...prev, ...validFiles]);
    if (validFiles.length > 0 && !topic) {
       setTopic(validFiles[0].name.replace(/\.[^/.]+$/, ""));
    }
  };

  const toggleLibrarySelection = (id: string | number) => {
    const sid = String(id);
    setSelectedLibraryIds(prev => prev.includes(sid) ? prev.filter(i => i !== sid) : [...prev, sid]);
  };

  const toggleExamStyle = (style: ExamStyle) => {
    setExamStyles(prev => {
        let newStyles = [];
        if (prev.includes(style)) {
            // Prevent empty selection, keep at least one
            if (prev.length === 1) return prev;
            newStyles = prev.filter(s => s !== style);
        } else {
            newStyles = [...prev, style];
        }
        
        // Re-distribute percentages equally
        const newPct: Record<string, number> = {};
        const equalShare = Math.floor(100 / newStyles.length);
        let remaining = 100;
        newStyles.forEach((s, idx) => {
            if (idx === newStyles.length - 1) {
                newPct[s] = remaining;
            } else {
                newPct[s] = equalShare;
                remaining -= equalShare;
            }
        });
        setBloomPercentages(newPct);
        
        return newStyles;
    });
  };

  const handlePercentageChange = (styleToChange: string, newTargetVal: number) => {
    const oldVal = bloomPercentages[styleToChange] || 0;
    const diff = newTargetVal - oldVal;
    const otherStyles = examStyles.filter(s => s !== styleToChange);
    if (otherStyles.length === 0) return; 
    
    let currentOthersTotal = 0;
    otherStyles.forEach(s => currentOthersTotal += (bloomPercentages[s] || 0));
    
    const nextPct = { ...bloomPercentages };
    nextPct[styleToChange] = newTargetVal;
    
    let remainingAdjustment = -diff;
    for (let i = 0; i < otherStyles.length; i++) {
        const s = otherStyles[i];
        if (i === otherStyles.length - 1) {
            nextPct[s] = (nextPct[s] || 0) + remainingAdjustment;
        } else {
            const share = currentOthersTotal > 0 
                ? Math.round(( (bloomPercentages[s] || 0) / currentOthersTotal ) * (-diff))
                : Math.round((-diff) / otherStyles.length);
            nextPct[s] = (nextPct[s] || 0) + share;
            remainingAdjustment -= share;
        }
        if (nextPct[s] < 0) {
            remainingAdjustment += nextPct[s]; 
            nextPct[s] = 0;
        }
    }
    
    // Fix rounding errors to ensure exactly 100
    let sum = Object.values(nextPct).reduce((a, b) => a + b, 0);
    if (sum !== 100) {
        for (const s of otherStyles) {
             if (nextPct[s] + (100 - sum) >= 0) {
                 nextPct[s] += (100 - sum);
                 break;
             }
        }
    }
    
    setBloomPercentages(nextPct);
  };

  const getInputValidationError = (): string | null =>
      inputMethod === 'library' && selectedLibraryIds.length === 0 ? t('cfgAlertLib') :
      inputMethod === 'upload' && files.length === 0 ? t('cfgAlertUpload') :
      inputMethod === 'topic' && !topic.trim() ? t('cfgAlertTopic') :
      inputMethod === 'url' && !urlInput.trim() ? t('cfgAlertUrl') :
      !topic && inputMethod === 'library' ? t('cfgAlertFocus') :
      !modelId ? t('cfgAlertModel') : null;

  const resolveInputContext = async (): Promise<{ finalTopic: string; finalLibraryContext: string }> => {
    let finalTopic = topic;
    let finalLibraryContext = '';
    if (inputMethod === 'library') {
      const selectedItems = libraryItems.filter((item) => selectedLibraryIds.includes(String(item.id)));
      finalLibraryContext = selectedItems
        .map((item) => `[SOURCE: ${item.title}]\n${item.processedContent || item.content}`)
        .join('\n\n');
    } else if (inputMethod === 'url') {
      const urlContent = await fetchUrlContent(urlInput);
      finalLibraryContext = `[SOURCE: ${urlInput}]\n${urlContent}`;
      if (!finalTopic) finalTopic = t('cfgUrl');
    }
    return { finalTopic, finalLibraryContext };
  };

  const handleStart = async () => {
    const validationError = getInputValidationError();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);

    setIsGenerating(true);

    let inputContext: Awaited<ReturnType<typeof resolveInputContext>>;
    try {
      inputContext = await resolveInputContext();
    } catch (error) {
      showErrorNotification({
        title: t('urlFetchFail'),
        action: 'handleStart.fetchUrlContent',
        whatHappened: t('urlFetchWhat'),
        error,
      });
      setIsGenerating(false);
      return;
    }

    await onStart(inputMethod === 'upload' ? files : [], {
      provider,
      modelId,
      questionCount,
      mode,
      examStyle: examStyles,
      bloomPercentages,
      topic: inputContext.finalTopic,
      customPrompt,
      libraryContext: inputContext.finalLibraryContext,
      enableRetention,
      enableMixedTypes,
      folder: folder || undefined,
    });
    setIsGenerating(false);
  };

  const handleFlashcardStart = async () => {
    const validationError = getInputValidationError();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);

    setIsGenerating(true);
    
    let inputContext: Awaited<ReturnType<typeof resolveInputContext>>;
    try {
      inputContext = await resolveInputContext();
    } catch (error) {
      showErrorNotification({
        title: t('urlFetchFail'),
        action: 'handleFlashcardStart.fetchUrlContent',
        whatHappened: t('urlFetchFlashWhat'),
        error,
      });
      setIsGenerating(false);
      return;
    }

    const apiKey = getApiKey(provider);
    if (!apiKey) {
      showErrorNotification({
        title: t('flashGenFail'),
        action: "handleFlashcardStart.apiKeyValidation",
        whatHappened: t('flashGenNeedKey'),
        error: "API Key missing (BYOK)"
      });
      setIsGenerating(false);
      return;
    }

    const { generateQuiz } = await import('../services/geminiService');
    try {
      const res = await generateQuiz(
        apiKey,
        inputMethod === 'upload' ? files : [],
        inputContext.finalTopic,
        modelId,
        questionCount,
        mode,
        examStyles,
        () => {},
        [],
        customPrompt,
        inputContext.finalLibraryContext
      );
      
      if (res.questions && res.questions.length > 0) {
        onStartFlashcards(res.questions);
      } else {
        showErrorNotification({
          title: t('flashGenFail'),
          action: "handleFlashcardStart.emptyResult",
          whatHappened: t('flashGenEmpty'),
          error: t('flashGenEmptyErr')
        });
      }
    } catch (err: any) {
      showErrorNotification({
        title: t('flashGenFail'),
        action: "handleFlashcardStart.generateQuiz",
        whatHappened: t('flashGenCrash'),
        error: err
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const isReady = (inputMethod === 'library' && selectedLibraryIds.length > 0 && topic.length > 2) || 
                  (inputMethod === 'upload' && files.length > 0) || 
                  (inputMethod === 'topic' && topic.trim().length > 3) ||
                  (inputMethod === 'url' && urlInput.trim().length > 5);

  // --- SEGMENTED CONTROL COMPONENT ---
  const InputTab = ({ id, icon: Icon, label }: { id: typeof inputMethod, icon: any, label: string }) => (
    <button 
        onClick={() => setInputMethod(id)}
        aria-label={label}
        aria-pressed={inputMethod === id}
        className={`relative flex items-center justify-center space-x-2 px-4 py-2 md:px-6 md:py-3 rounded-xl transition-all z-10 ${inputMethod === id ? 'text-indigo-700 font-bold' : 'text-slate-500 font-medium hover:text-slate-700'}`}
    >
        {inputMethod === id && (
            <motion.div 
                layoutId="active-tab"
                className="absolute inset-0 bg-white shadow-md border border-indigo-100 rounded-xl"
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
        )}
        <span className="relative z-10 flex items-center gap-2 text-sm md:text-base"><Icon size={18} /> <span className="hidden md:inline">{label}</span></span>
    </button>
  );

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5 md:space-y-8 pb-24 text-theme-text">
      
      {/* HERO HEADER */}
      <div className="text-center space-y-2 pt-4">
        <h1 className="text-5xl md:text-6xl font-black tracking-tighter">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600">
                {t('pageHomeTitle')}
            </span>
        </h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">{t('pageHomePurpose')}</p>
      </div>

      <div className="relative">
         <DashboardMascot onOpenScheduler={() => setIsSchedulerOpen(true)} />
      </div>

      <AnimatePresence>
        {hasActiveSession && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="w-full">
            <button onClick={onContinue} className="btn-tactile w-full bg-emerald-500 border-emerald-600 text-white p-4 rounded-3xl shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-3 mb-4">
              <PlayCircle size={24} /> <span className="text-lg font-bold">{t('cfgContinue')}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-[2.5rem] p-4 md:p-8 shadow-xl shadow-indigo-500/5 relative overflow-hidden">
        
        {/* SEGMENTED CONTROL FOR INPUT */}
        <div className="flex p-1.5 bg-slate-100/50 border border-slate-200/50 rounded-2xl mb-5 md:mb-8 w-fit mx-auto shadow-inner overflow-x-auto max-w-full no-scrollbar">
          <InputTab id="library" icon={BookOpen} label={t('cfgLibrary')} />
          <InputTab id="upload" icon={Upload} label={t('cfgUpload')} />
          <InputTab id="topic" icon={Type} label={t('cfgManual')} />
          <InputTab id="url" icon={LinkIcon} label={t('cfgUrl')} />
        </div>

        {/* --- MAIN INPUT AREA --- */}
        <div className="mb-8">
          <AnimatePresence mode='wait'>
            {inputMethod === 'library' && (
                <motion.div 
                    key="library"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                >
                    <div className="max-h-60 overflow-y-auto custom-scrollbar border border-white rounded-3xl bg-slate-50/50 p-3 shadow-inner">
                    {libraryItems.length === 0 ? (
                        <p className="text-center py-6 md:py-12 text-slate-500 text-sm font-medium">{t('cfgLibEmpty')}</p>
                    ) : (
                        libraryItems.map((item, idx) => (
                            <div key={`${item.id}-${idx}`} onClick={() => toggleLibrarySelection(item.id)} className={`group flex items-center justify-between p-3 mb-2 rounded-2xl cursor-pointer transition-all border ${selectedLibraryIds.includes(String(item.id)) ? 'bg-white border-indigo-200 shadow-md translate-x-1' : 'bg-transparent border-transparent hover:bg-white/60 hover:shadow-sm'}`}>
                                <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`p-2.5 rounded-xl transition-colors ${selectedLibraryIds.includes(String(item.id)) ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200/50 text-slate-500 group-hover:bg-white'}`}><FileText size={18} /></div>
                                <div className="min-w-0">
                                    <span className={`block text-sm font-bold truncate ${selectedLibraryIds.includes(String(item.id)) ? 'text-indigo-900' : 'text-slate-600'}`}>{item.title}</span>
                                    {item.processedContent && <span className="text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-bold flex w-fit items-center mt-0.5 gap-1"><Zap size={8} /> FAST</span>}
                                </div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedLibraryIds.includes(String(item.id)) ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-300 text-transparent'}`}>
                                    <CheckCircle2 size={14} />
                                </div>
                            </div>
                        ))
                    )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 px-2 font-medium">
                        <span>{t('cfgSelected')}: {selectedLibraryIds.length}</span>
                        <button onClick={onOpenWorkspace} className="text-indigo-600 hover:underline">{t('cfgManageLib')} →</button>
                    </div>
                </motion.div>
            )}

            {inputMethod === 'upload' && (
                <motion.div 
                    key="upload"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`relative group h-40 md:h-52 border-2 border-dashed rounded-[2rem] transition-all flex flex-col items-center justify-center text-center overflow-hidden p-5 md:p-8 ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'} cursor-pointer`}
                    role="button"
                    tabIndex={0}
                    aria-label={t('cfgDropTitle')}
                    onDragEnter={(e)=>{e.preventDefault();setDragActive(true)}} 
                    onDragLeave={(e)=>{e.preventDefault();setDragActive(false)}} 
                    onDragOver={(e)=>{e.preventDefault();setDragActive(true)}} 
                    onDrop={e => {e.preventDefault(); handleFilesUpload(e.dataTransfer.files);}} 
                    onClick={() => document.getElementById('file-upload')?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        document.getElementById('file-upload')?.click();
                      }
                    }}
                >
                    <input id="file-upload" type="file" multiple className="hidden" accept=".pdf,.md,.txt,image/*" onChange={(e) => handleFilesUpload(e.target.files)} />
                    {files.length > 0 ? (
                        <div className="w-full space-y-2">
                            {files.map((f,i) => (
                                <motion.div initial={{y:10, opacity:0}} animate={{y:0, opacity:1}} key={i} className="bg-white p-3 rounded-xl text-sm flex items-center justify-center text-indigo-700 shadow-sm border border-indigo-100 font-bold">
                                    <CheckCircle2 size={16} className="mr-2 text-emerald-500"/> {f.name}
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <>
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform"><Upload size={28} className="text-indigo-500" /></div>
                            <p className="font-bold text-slate-700">{t('cfgDropTitle')}</p>
                            <p className="text-xs text-slate-500 mt-1">{t('cfgDropSub')}</p>
                        </>
                    )}
                </motion.div>
            )}

            {inputMethod === 'topic' && (
                <motion.div key="topic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('cfgTopicPh')} className="w-full h-40 md:h-52 bg-white border border-slate-200 rounded-[2rem] p-5 md:p-6 text-slate-700 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-inner resize-none transition-shadow" />
                </motion.div>
            )}

            {inputMethod === 'url' && (
                <motion.div key="url" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="w-full min-h-40 md:h-52 bg-white border border-slate-200 rounded-[2rem] p-5 md:p-6 flex flex-col justify-center shadow-inner">
                        <label className="text-sm font-bold text-slate-500 mb-2 flex items-center">
                            <LinkIcon size={16} className="mr-2" /> {t('cfgUrlLabel')}
                        </label>
                        <input 
                            type="url" 
                            value={urlInput} 
                            onChange={(e) => setUrlInput(e.target.value)} 
                            placeholder={t('cfgUrlPh')} 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow" 
                        />
                        <p className="text-xs text-slate-500 mt-3">{t('cfgUrlHint')}</p>
                    </div>
                </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* --- COMMON CONTROLS --- */}
        <div className="space-y-6">
           {(inputMethod === 'library' || inputMethod === 'upload') && (
              <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
                 <label className="flex items-center text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">
                    <Target size={14} className="mr-1" /> {t('cfgFocusTopic')}
                 </label>
                 <input 
                   type="text" 
                   value={topic} 
                   onChange={(e) => setTopic(e.target.value)} 
                   placeholder={t('cfgFocusPh')} 
                   className="w-full bg-transparent border-b-2 border-indigo-200 py-2 text-lg font-bold text-indigo-900 placeholder:text-indigo-300 focus:outline-none focus:border-indigo-500 transition-colors"
                 />
              </div>
           )}

           {/* --- AI BRAIN CONTROL --- */}
           <div className="bg-white/50 p-4 rounded-3xl border border-white shadow-sm flex flex-col md:flex-row gap-4 items-center">
              {/* Provider Switcher — all providers from Settings catalog */}
              <div className="relative shrink-0 w-full md:w-auto md:min-w-[10rem]">
                 <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
                    className="w-full appearance-none bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-4 py-2.5 pr-9 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                 >
                    {PROVIDER_CATALOG.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                 </select>
                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    <ChevronDown size={14} />
                 </div>
              </div>

              {/* Model Dropdown */}
              <div className="relative flex-1 w-full">
                 <select 
                    value={modelId}
                    onChange={(e) => handleModelChange(e.target.value)}
                    disabled={isLoadingModels || dynamicModels.filter(m => m.provider === provider).length === 0}
                    className="w-full appearance-none bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                 >
                    {dynamicModels.filter(m => m && m.provider === provider).length > 0 ? (
                       dynamicModels.filter(m => m && m.provider === provider).map(m => (
                          <option key={m.id || "unknown"} value={m.id || ""}>{m.label || "Unknown Model"}</option>
                       ))
                    ) : (
                       <option value="">{getApiKey(provider) ? t('cfgFailLoadModel') : t('cfgNeedKeySettings')}</option>
                    )}
                 </select>
                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    {isLoadingModels ? <RefreshCw className="animate-spin" size={14} /> : <ChevronDown size={14} />}
                 </div>
              </div>
           </div>

           {/* --- FOLDER CONTROL --- */}
           <div className="bg-white/50 p-4 rounded-3xl border border-white shadow-sm flex items-center">
              <div className="flex items-center gap-2 text-slate-500 mr-4">
                 <Folder size={18} />
                 <span className="text-sm font-bold">{t('cfgFolder')}</span>
              </div>
              <input 
                 type="text" 
                 value={folder}
                 onChange={(e) => setFolder(e.target.value)}
                 placeholder={t('folderOptional')}
                 className="flex-1 bg-white border border-slate-200 text-slate-700 font-medium text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
           </div>

           {/* Mode Selection with Tactile Cards */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {getModeCards().map((m) => (
                 <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    aria-pressed={mode === m.id}
                    className={`
                        relative p-4 rounded-3xl text-left transition-all btn-tactile
                        ${mode === m.id 
                            ? `${m.color} bg-white border-b-4 shadow-lg scale-[1.02]` 
                            : 'bg-white border-slate-200 border-b-4 text-slate-500 hover:bg-slate-50 hover:border-slate-300'}
                    `}
                    style={{ borderColor: mode === m.id ? 'currentColor' : undefined }} // Use text color for active border
                 >
                    <div className="flex justify-between mb-2">
                        <m.icon size={24} /> 
                        {mode === m.id && <div className="bg-current rounded-full p-0.5"><CheckCircle2 size={14} className="text-white"/></div>}
                    </div>
                    <div className="font-bold text-sm">{m.label}</div>
                    <div className="text-[10px] opacity-70 font-medium">{m.desc}</div>
                 </button>
              ))}
           </div>

           {/* BLOOM LEVEL SELECTOR (MULTI-SELECT) */}
           <div className="bg-white/50 p-5 rounded-3xl border border-white shadow-sm">
                <label className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                    <TrendingUp size={14} className="mr-1.5" /> {t('cfgBloomLabel')}
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {getBloomLevels().map(level => {
                        const isSelected = examStyles.includes(level.id);
                        return (
                            <button
                                key={level.id}
                                onClick={() => toggleExamStyle(level.id)}
                                aria-pressed={isSelected}
                                className={`
                                    relative p-2 rounded-xl text-center transition-all 
                                    ${isSelected ? 'bg-indigo-600 text-white shadow-md transform scale-[1.02]' : 'bg-white border border-slate-200 text-slate-500 hover:bg-indigo-50'}
                                `}
                            >
                                {isSelected && (
                                    <div className="absolute top-1 right-1 bg-white text-indigo-600 rounded-full p-0.5">
                                        <Check size={8} strokeWidth={4} />
                                    </div>
                                )}
                                <div className="text-xs font-bold">{level.label.split(':')[0]}</div>
                                <div className={`text-[10px] ${isSelected ? 'opacity-90' : 'opacity-80'}`}>{level.desc}</div>
                            </button>
                        );
                    })}
                </div>

                 {/* PERCENTAGE DISTRIBUTION SLIDERS (shows when >1 level selected) */}
                 {examStyles.length > 1 && (
                     <div className="mt-4 pt-4 border-t border-slate-100">
                         <div className="flex items-center justify-between mb-4">
                             <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{t('cfgBloomMix')}</span>
                             <span className="text-[10px] text-slate-400 font-medium">{t('cfgQuestionTotal').replace('{count}', String(questionCount))}</span>
                         </div>
                         <div className="space-y-4">
                             {examStyles.map((style, i) => {
                                 const levelInfo = getBloomLevels().find(l => l.id === style);
                                 const pct = bloomPercentages[style] || 0;
                                 const qCount = Math.round((pct / 100) * questionCount);
                                 const dotColors = ['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500'];
                                 const txtColors = ['text-blue-600', 'text-indigo-600', 'text-violet-600', 'text-purple-600', 'text-fuchsia-600'];
                                 const accentColors = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'];
                                 return (
                                     <div key={style} className="flex flex-col gap-1">
                                         <div className="flex items-center justify-between">
                                             <div className="flex items-center gap-2">
                                                 <div className={`w-2 h-2 rounded-full ${dotColors[i % dotColors.length]} shrink-0`} />
                                                 <span className={`text-xs font-bold ${txtColors[i % txtColors.length]}`}>{levelInfo?.label.split(':')[0]}</span>
                                             </div>
                                             <span className="text-xs font-bold text-slate-600 w-20 text-right">{pct}% ({qCount})</span>
                                         </div>
                                         <input 
                                             type="range" 
                                             min="0" 
                                             max="100" 
                                             value={pct}
                                             aria-label={`${levelInfo?.label || style} ${pct}%`}
                                             onChange={(e) => handlePercentageChange(style, parseInt(e.target.value))}
                                             className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer"
                                             style={{ accentColor: accentColors[i % accentColors.length] }}
                                         />
                                     </div>
                                 );
                             })}
                         </div>
                         <p className="text-[10px] text-slate-400 mt-4 text-center">⚡ {t('cfgBloomSliderHint')}</p>
                     </div>
                 )}
           </div>

           {/* CUSTOM PROMPT */}
           <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center text-xs font-bold text-indigo-500 hover:underline mx-auto">
                <Settings2 size={12} className="mr-1" /> {showAdvanced ? t('cfgHideAdvanced') : t('cfgShowAdvanced')}
           </button>

           <AnimatePresence>
                {showAdvanced && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-4">
                        <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm">
                            <label className="flex items-center text-xs font-bold text-indigo-500 uppercase tracking-widest mb-2">
                                <MessageSquarePlus size={14} className="mr-1.5" /> {t('cfgCustomInstruction')}
                            </label>
                            <textarea 
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                placeholder={t('customPromptPh')}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none h-24"
                            />
                        </div>

                        {/* --- TOGGLES --- */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button 
                                onClick={() => setEnableRetention(!enableRetention)}
                                aria-pressed={enableRetention}
                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${enableRetention ? 'bg-indigo-50 border-indigo-200 shadow-inner' : 'bg-white border-transparent hover:border-slate-200'}`}
                            >
                                <div className="flex items-center">
                                    <div className={`p-2.5 rounded-xl mr-3 ${enableRetention ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        <BrainCircuit size={20} />
                                    </div>
                                    <div className="text-left">
                                        <span className={`block font-bold text-sm ${enableRetention ? 'text-indigo-900' : 'text-slate-600'}`}>{t('cfgSticky')}</span>
                                    </div>
                                </div>
                                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${enableRetention ? 'bg-indigo-500' : 'bg-slate-200'}`}><motion.div className="w-4 h-4 bg-white rounded-full shadow-sm" animate={{ x: enableRetention ? 16 : 0 }} /></div>
                            </button>

                            <button 
                                onClick={() => setEnableMixedTypes(!enableMixedTypes)}
                                aria-pressed={enableMixedTypes}
                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${enableMixedTypes ? 'bg-fuchsia-50 border-fuchsia-200 shadow-inner' : 'bg-white border-transparent hover:border-slate-200'}`}
                            >
                                <div className="flex items-center">
                                    <div className={`p-2.5 rounded-xl mr-3 ${enableMixedTypes ? 'bg-fuchsia-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        <Shuffle size={20} />
                                    </div>
                                    <div className="text-left">
                                        <span className={`block font-bold text-sm ${enableMixedTypes ? 'text-fuchsia-900' : 'text-slate-600'}`}>{t('cfgMixedTypes')}</span>
                                    </div>
                                </div>
                                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${enableMixedTypes ? 'bg-fuchsia-500' : 'bg-slate-200'}`}><motion.div className="w-4 h-4 bg-white rounded-full shadow-sm" animate={{ x: enableMixedTypes ? 16 : 0 }} /></div>
                            </button>
                        </div>
                    </motion.div>
                )}
           </AnimatePresence>

           {/* SLIDER + PRESETS */}
           <div className="bg-white/50 p-5 rounded-3xl border border-white shadow-sm">
               <div className="flex justify-between items-center mb-3">
                   <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('cfgQuestionCount')}</span>
                   <div className="flex items-center gap-2">
                       <button 
                         onClick={() => setQuestionCount(Math.max(5, questionCount - 5))}
                         className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm flex items-center justify-center transition-colors"
                       >−</button>
                       <input
                         type="number"
                         min="5"
                         max="200"
                         value={questionCount}
                         onChange={(e) => {
                           const val = parseInt(e.target.value);
                           if (!isNaN(val) && val >= 1 && val <= 200) setQuestionCount(val);
                         }}
                         className="w-14 text-center text-xl font-black text-indigo-600 bg-transparent border-b-2 border-indigo-200 focus:border-indigo-500 outline-none"
                       />
                       <button 
                         onClick={() => setQuestionCount(Math.min(200, questionCount + 5))}
                         className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm flex items-center justify-center transition-colors"
                       >+</button>
                   </div>
               </div>
               <input 
                 type="range" min="5" max="200" step="5" 
                 value={questionCount} 
                 onChange={(e) => setQuestionCount(parseInt(e.target.value))} 
                 className="w-full h-3 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500" 
               />
               <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-bold px-1">
                   <span>5</span><span>50</span><span>100</span><span>200</span>
               </div>
               
               {/* Quick Presets */}
               <div className="flex gap-2 mt-3">
                 {[10, 25, 50, 100, 200].map(preset => (
                   <button
                     key={preset}
                     onClick={() => setQuestionCount(preset)}
                     className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                       questionCount === preset 
                         ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30' 
                         : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                     }`}
                   >
                     {preset}
                   </button>
                 ))}
               </div>

               {/* Warning for >50 */}
               {questionCount > 50 && (
                 <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                   <span className="text-amber-500 text-sm shrink-0">⚠️</span>
                   <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                     {t('cfgManyQ')}
                   </p>
                 </div>
               )}
           </div>
        </div>

        <div className="mt-8 space-y-4">
           {!hasApiKey && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm flex items-start shadow-sm">
                 <Settings2 className="mr-3 shrink-0 mt-0.5 text-amber-600" size={18} />
                 <div>
                    <span className="font-bold block mb-1">{t('cfgNoKeyTitle')}</span>
                    <p className="opacity-90">{t('cfgNoKeyBody')}</p>
                    <p className="text-xs mt-2 text-amber-700 font-medium">💡 {t('cfgNoKeyHint')}</p>
                 </div>
              </div>
            )}

            {formError && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{formError}</p>}
            <div className="flex gap-3 sm:gap-4">
              <button 
                onClick={handleFlashcardStart} 
                disabled={!isReady || isGenerating || !hasApiKey} 
                className={`btn-tactile flex-1 py-4 rounded-2xl font-bold text-lg shadow-xl flex items-center justify-center transition-all ${!hasApiKey ? 'bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed shadow-none' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              >
                <Layers className="mr-2" size={20} />
                Flashcard
              </button>
              <button 
                onClick={handleStart} 
                disabled={!isReady || isGenerating || !hasApiKey} 
                className={`btn-tactile flex-[2] py-4 rounded-2xl font-bold text-lg shadow-xl flex items-center justify-center transition-all ${!hasApiKey ? 'bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed shadow-none' : 'bg-slate-900 border-slate-700 text-white shadow-slate-900/10 hover:bg-slate-800'}`}
              >
                {isGenerating ? <RefreshCw className="animate-spin mr-2" /> : <Sparkles className={`mr-2 ${!hasApiKey ? 'text-slate-500 fill-slate-400' : 'fill-yellow-400 text-yellow-400'}`} />}
                {inputMethod === 'library' ? t('cfgGenerate') : t('cfgStart')}
              </button>
            </div>
         </div>

      </motion.div>

      <StudyScheduler isOpen={isSchedulerOpen} onClose={() => setIsSchedulerOpen(false)} defaultTopic={topic} />
      <AnimatePresence>
        {isReviewing && (
          <FlashcardScreen 
            questions={dueCards} 
            onClose={() => { 
              setIsReviewing(false); 
              getDueItems().then(items => {
                if (items) setDueCards(items);
              });
            }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};
