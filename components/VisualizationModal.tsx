import React, { useState, useEffect } from 'react';
import { VisualizationGallery } from './VisualizationGallery';
import { get } from 'idb-keyval';
import { Question, VisualizationBlueprint, VisualizationResult } from '../types';
import { saveQuizVisualizations, HISTORY_IDB_KEY } from '../services/storageService';
import { FolderInput, X } from 'lucide-react';
import { getLocale, t } from '../services/i18n';
import { OverlayPortal } from './OverlayPortal';

interface VisualizationModalProps {
  questions: Question[];
  title?: string;
  quizId?: number | string;
  materialContext?: string;
  onClose: () => void;
  /** Clear pack selection and return to the hub picker */
  onChangeSource?: () => void;
}

export const VisualizationModal: React.FC<VisualizationModalProps> = ({ 
  questions, 
  title, 
  quizId, 
  materialContext: externalContext, 
  onClose,
  onChangeSource,
}) => {
  const isId = getLocale() === 'id';
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
    <OverlayPortal labelledBy="visualization-modal-title" className="fixed inset-0 z-[160] bg-slate-950/75 flex items-center justify-center p-2 sm:p-6 backdrop-blur-md">
      <div className="bg-slate-50 dark:bg-slate-900 w-full max-w-6xl h-[calc(100dvh-1rem)] sm:h-[min(90dvh,56rem)] rounded-2xl sm:rounded-3xl flex flex-col shadow-2xl relative overflow-hidden border border-white/10">
         <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-2 bg-white dark:bg-slate-950 sticky top-0 z-20 shadow-sm">
            <h2 id="visualization-modal-title" className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 min-w-0">
               <span className="text-indigo-600 shrink-0">(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</span>
               <span className="truncate">{title || t('aiSimBtn')}</span>
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              {onChangeSource && (
                <button
                  type="button"
                  onClick={onChangeSource}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300"
                >
                  <FolderInput size={14} />
                  {isId ? 'Ganti sumber' : 'Change source'}
                </button>
              )}
              <button type="button" aria-label="Close simulations" onClick={onClose} className="p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors">
                 <X size={20} />
              </button>
            </div>
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
    </OverlayPortal>
  );
};
