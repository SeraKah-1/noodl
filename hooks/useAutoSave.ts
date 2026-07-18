import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { update } from 'idb-keyval';
import { HISTORY_IDB_KEY } from '../services/storageService';

export const useAutoSave = () => {
  const { activeQuizId, originalQuestions } = useAppStore();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!activeQuizId || originalQuestions.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        await update(HISTORY_IDB_KEY, (val) => {
          const history = val || [];
          return history.map((item: any) =>
            String(item.id) === String(activeQuizId)
              ? { ...item, questions: originalQuestions, lastUpdated: new Date().toISOString() }
              : item
          );
        });
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [originalQuestions, activeQuizId]);
};
