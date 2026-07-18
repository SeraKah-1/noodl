import React, { useState, useEffect } from 'react';
import { VisualizationGallery } from './VisualizationGallery';
import { get } from 'idb-keyval';
import { Question, VisualizationBlueprint, VisualizationResult } from '../types';
import { saveQuizVisualizations, HISTORY_IDB_KEY } from '../services/storageService';
import { X } from 'lucide-react';
import { t } from '../services/i18n';

interface VisualizationModalProps {
  questions: Question[];
  title?: string;
  quizId?: number | string;
  materialContext?: string;
  onClose: () => void;
}

export const VisualizationModal: React.FC<VisualizationModalProps> = ({ 
  questions, 
  title, 
  quizId, 
  materialContext: externalContext, 
  onClose 
}) => {
  const [initialVisualizations, setInitialVisualizations] = useState<{ blueprints: VisualizationBlueprint[], results: VisualizationResult[] } | undefined>();

  useEffect(() => {
     if (quizId) {
         // Try to load from IDB
         get(HISTORY_IDB_KEY).then((history: any) => {
             if (history) {
                 const quiz = history.find((q: any) => String(q.id) === String(quizId));
                 if (quiz && quiz.visualizationsData) {
                     setInitialVisualizations(quiz.visualizationsData);
                 }
             }
         }).catch(e => console.error("Failed to load cached visualizations data", e));
     }
  }, [quizId]);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/90 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm">
      <div className="bg-slate-50 dark:bg-slate-900 w-full max-w-5xl h-[95vh] sm:h-[90vh] rounded-3xl flex flex-col shadow-2xl relative overflow-hidden">
         <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-950 sticky top-0 z-20 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
               <span className="text-indigo-600">(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</span> {title || t('aiSimBtn')}
            </h2>
            <button onClick={onClose} className="p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors">
               <X size={20} />
            </button>
         </div>
         <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            <VisualizationGallery
               quizId={quizId}
               materialContext={externalContext || questions.map(q => `[${q.keyPoint}] ${q.text}\n${q.explanation}`).join('\n\n')}
               initialBlueprints={initialVisualizations?.blueprints}
               initialResults={initialVisualizations?.results}
               onSaveVisualizations={(blueprints, results) => {
                 setInitialVisualizations({ blueprints, results });
                 if (quizId) {
                   saveQuizVisualizations(quizId, { blueprints, results }).catch(e => console.error("Failed to save visualizations cache", e));
                 }
               }}
            />
         </div>
      </div>
    </div>
  );
};
