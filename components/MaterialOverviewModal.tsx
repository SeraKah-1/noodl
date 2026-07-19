import React, { useState, useEffect } from 'react';
import { MaterialOverview } from './MaterialOverview';
import { get } from 'idb-keyval';
import { Question, QuizResult, DeepInsightData, VisualizationBlueprint, VisualizationResult } from '../types';
import { generateDeepInsight } from '../services/geminiService';
import { getApiKey, saveQuizAiOverview, saveQuizVisualizations, HISTORY_IDB_KEY } from '../services/storageService';
import { X } from 'lucide-react';
import { t } from '../services/i18n';
import { notifyUser } from '../services/uiFeedbackService';
import { OverlayPortal } from './OverlayPortal';

interface MaterialOverviewModalProps {
  questions: Question[];
  result?: QuizResult | null;
  title?: string;
  quizId?: number | string;
  initialAiData?: DeepInsightData | null;
  materialContext?: string;
  onClose: () => void;
}

export const MaterialOverviewModal: React.FC<MaterialOverviewModalProps> = ({ questions, result, title, quizId, initialAiData, materialContext: externalContext, onClose }) => {
  const resolvedTitle = title || t('conceptMapTitle');
  const [aiOverviewData, setAiOverviewData] = useState<DeepInsightData | null>(initialAiData || null);
  const [initialVisualizations, setInitialVisualizations] = useState<{ blueprints: VisualizationBlueprint[], results: VisualizationResult[] } | undefined>();
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ current: number; total: number } | undefined>();

  useEffect(() => {
     if (!initialAiData && quizId && !aiOverviewData) {
         // Try to load from IDB
         get(HISTORY_IDB_KEY).then((history: any) => {
             if (history) {
                 const quiz = history.find((q: any) => String(q.id) === String(quizId));
                 if (quiz && quiz.aiOverviewData) {
                     setAiOverviewData(quiz.aiOverviewData);
                 }
                 if (quiz && quiz.visualizationsData) {
                     setInitialVisualizations(quiz.visualizationsData);
                 }
             }
         }).catch(e => console.error("Failed to load cached AI data", e));
     }
  }, [quizId, initialAiData]);

  const handleGenerateAI = async () => {
    try {
       setIsGeneratingAI(true);
       setAiProgress({ current: 0, total: 1 });
       const { getActiveProvider } = await import('../services/providerService');
       const provider = getActiveProvider();
       const apiKey = getApiKey(provider);
       if (!apiKey) {
           throw new Error("API key not found for the active provider. Settings → AI providers (BYOK).");
       }
       
       // Group data
       const groups: Record<string, { priority: string; questions: Question[]; totalAnswers: number; correctAnswers: number }> = {};
       questions.forEach((q, idx) => {
         const topic = q.conceptName || q.keyPoint || 'Konsep Umum';
         const priority = q.conceptPriority || 'MODERATE';
         if (!groups[topic]) {
           groups[topic] = { priority, questions: [], totalAnswers: 0, correctAnswers: 0 };
         }
         groups[topic].questions.push(q);
         if (result && result.answers[idx]) {
           groups[topic].totalAnswers++;
           if (result.answers[idx].isCorrect) {
             groups[topic].correctAnswers++;
           }
         }
       });

       const data = await generateDeepInsight(groups, apiKey || '', (current, total) => {
         setAiProgress({ current, total });
       });
       
       setAiOverviewData(data);
       if (quizId) {
          await saveQuizAiOverview(quizId, data).catch(e => console.error("Failed to save AI overview cache", e));
       }
    } catch (err: any) {
       notifyUser(err.message, 'error');
    } finally {
       setIsGeneratingAI(false);
    }
  };

  return (
    <OverlayPortal labelledBy="material-overview-title" className="fixed inset-0 z-[160] bg-slate-950/75 flex items-center justify-center p-2 sm:p-6 backdrop-blur-md">
      <div className="bg-slate-50 dark:bg-slate-900 w-full max-w-6xl h-[calc(100dvh-1rem)] sm:h-[min(90dvh,56rem)] rounded-2xl sm:rounded-3xl flex flex-col shadow-2xl relative overflow-hidden border border-white/10">
         <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-950 sticky top-0 z-20 shadow-sm">
            <h2 id="material-overview-title" className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 min-w-0">
               <span className="text-indigo-600">( •_•)⌐■-■</span> {t('conceptMapTitle')}
            </h2>
            <button type="button" aria-label="Close concept map" onClick={onClose} className="p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors shrink-0">
               <X size={20} />
            </button>
         </div>
         <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <MaterialOverview 
               questions={questions} 
               result={result} 
               title={resolvedTitle} 
               quizId={quizId}
               onGenerateAI={handleGenerateAI}
               aiOverviewData={aiOverviewData}
               isGeneratingAI={isGeneratingAI}
               aiProgress={aiProgress}
               materialContext={externalContext || questions.map(q => `[${q.keyPoint}] ${q.text}\n${q.explanation}`).join('\n\n')}
               initialVisualizations={initialVisualizations}
               onSaveVisualizations={(blueprints, results) => {
                 setInitialVisualizations({ blueprints, results });
                 if (quizId) {
                   saveQuizVisualizations(quizId, { blueprints, results }).catch(e => console.error("Failed to save visualizations cache", e));
                 }
               }}
            />
         </div>
      </div>
    </OverlayPortal>
  );
};
