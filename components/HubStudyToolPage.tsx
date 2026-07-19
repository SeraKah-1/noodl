/**
 * Hub "More" tools (Chat / Visual Lab / Material Bank) need an explicit study
 * source. History modals already pass full quiz context; the global App routes
 * previously only passed lastConfig.topic placeholders. This page unifies both:
 * pick a saved quiz (or the in-session pack) then run the tool with real data.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  FolderOpen,
  Loader2,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { getSavedQuizzes } from '../services/storageService';
import { getLocale, t } from '../services/i18n';
import type { DeepInsightData, Question, QuizResult } from '../types';
import { ChatScreen } from './ChatScreen';
import { MaterialOverviewModal } from './MaterialOverviewModal';
import { VisualizationModal } from './VisualizationModal';

export type HubToolKind = 'chat' | 'visualization' | 'material';

export interface SessionPack {
  quizId: string | number | null;
  title: string;
  questions: Question[];
  result?: QuizResult | null;
  libraryContext?: string;
  topic?: string;
  aiOverviewData?: DeepInsightData | null;
}

interface HubStudyToolPageProps {
  tool: HubToolKind;
  sessionPack: SessionPack;
  onClose: () => void;
  /** When user picks a pack that should become the app's active quiz context */
  onBindActiveQuiz?: (quizId: string | number | null) => void;
}

type SavedQuizRow = {
  id: string | number;
  fileName?: string;
  topicSummary?: string;
  title?: string;
  questions?: Question[];
  libraryContext?: string;
  topic?: string;
  lastScore?: number | null;
  timestamp?: number;
  aiOverviewData?: DeepInsightData | null;
};

function quizTitle(q: SavedQuizRow | SessionPack): string {
  if ('fileName' in q && q.fileName) return String(q.fileName);
  if ('title' in q && q.title) return String(q.title);
  if ('topicSummary' in q && q.topicSummary) return String(q.topicSummary);
  if ('topic' in q && q.topic) return String(q.topic).split('\n')[0].slice(0, 60);
  return getLocale() === 'id' ? 'Kuis tanpa judul' : 'Untitled quiz';
}

/** Prefer long library text, then Q&A dump, then short topic — same idea as History modals. */
export function buildMaterialContext(pack: {
  libraryContext?: string;
  questions?: Question[];
  topic?: string;
  title?: string;
}): string {
  const library = String(pack.libraryContext || '').trim();
  if (library.length >= 50) return library;

  const fromQuestions = (pack.questions || [])
    .map((q) => {
      const label = q.conceptName || q.keyPoint || '';
      const head = label ? `[${label}] ` : '';
      const exp = q.explanation ? `\n${q.explanation}` : '';
      return `${head}${q.text}${exp}`;
    })
    .join('\n\n')
    .trim();
  if (fromQuestions.length >= 50) {
    return library ? `${library}\n\n---\n\n${fromQuestions}` : fromQuestions;
  }

  const topic = String(pack.topic || pack.title || '').trim();
  const bits = [library, fromQuestions, topic].filter(Boolean);
  return bits.join('\n\n');
}

const TOOL_META: Record<
  HubToolKind,
  { icon: React.ElementType; titleKey: 'hubChat' | 'hubVisual' | 'hubMaterial'; descKey: 'hubChatDesc' | 'hubVisualDesc' | 'hubMaterialDesc' }
> = {
  chat: { icon: MessageSquare, titleKey: 'hubChat', descKey: 'hubChatDesc' },
  visualization: { icon: Sparkles, titleKey: 'hubVisual', descKey: 'hubVisualDesc' },
  material: { icon: BookOpen, titleKey: 'hubMaterial', descKey: 'hubMaterialDesc' },
};

export const HubStudyToolPage: React.FC<HubStudyToolPageProps> = ({
  tool,
  sessionPack,
  onClose,
  onBindActiveQuiz,
}) => {
  const isId = getLocale() === 'id';
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<SavedQuizRow[]>([]);
  const [selected, setSelected] = useState<SessionPack | null>(null);
  const [query, setQuery] = useState('');

  const meta = TOOL_META[tool];
  const Icon = meta.icon;

  const sessionUsable = useMemo(() => {
    const qs = sessionPack.questions || [];
    const ctx = buildMaterialContext(sessionPack);
    return qs.length >= 1 || ctx.length >= 50;
  }, [sessionPack]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = (await getSavedQuizzes()) as SavedQuizRow[];
        if (cancelled) return;
        const sorted = [...(list || [])].sort(
          (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
        );
        setHistory(sorted);

        // Prefer active session pack if it has real content
        if (sessionUsable) {
          setSelected({
            quizId: sessionPack.quizId,
            title: sessionPack.title || quizTitle(sessionPack),
            questions: sessionPack.questions || [],
            result: sessionPack.result,
            libraryContext: sessionPack.libraryContext,
            topic: sessionPack.topic,
            aiOverviewData: sessionPack.aiOverviewData,
          });
          return;
        }

        // Else auto-pick activeQuizId match from history
        if (sessionPack.quizId) {
          const match = sorted.find((q) => String(q.id) === String(sessionPack.quizId));
          if (match && (match.questions?.length || String(match.libraryContext || '').length >= 50)) {
            setSelected({
              quizId: match.id,
              title: quizTitle(match),
              questions: match.questions || [],
              libraryContext: match.libraryContext,
              topic: match.topic || match.topicSummary,
              aiOverviewData: match.aiOverviewData,
            });
            return;
          }
        }

        setSelected(null);
      } catch (e) {
        console.error('[HubStudyToolPage] load history failed', e);
        setHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionPack.quizId, sessionUsable]); // re-bind when active id changes

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((row) => {
      const hay = `${quizTitle(row)} ${row.topicSummary || ''} ${row.libraryContext || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [history, query]);

  const pickHistory = useCallback(
    (row: SavedQuizRow) => {
      const pack: SessionPack = {
        quizId: row.id,
        title: quizTitle(row),
        questions: row.questions || [],
        libraryContext: row.libraryContext,
        topic: row.topic || row.topicSummary,
        aiOverviewData: row.aiOverviewData,
      };
      setSelected(pack);
      onBindActiveQuiz?.(row.id);
    },
    [onBindActiveQuiz]
  );

  const pickSession = useCallback(() => {
    if (!sessionUsable) return;
    const pack: SessionPack = {
      quizId: sessionPack.quizId,
      title: sessionPack.title || quizTitle(sessionPack),
      questions: sessionPack.questions || [],
      result: sessionPack.result,
      libraryContext: sessionPack.libraryContext,
      topic: sessionPack.topic,
      aiOverviewData: sessionPack.aiOverviewData,
    };
    setSelected(pack);
    onBindActiveQuiz?.(sessionPack.quizId);
  }, [sessionPack, sessionUsable, onBindActiveQuiz]);

  const materialContext = useMemo(
    () => (selected ? buildMaterialContext(selected) : ''),
    [selected]
  );

  // ── Tool surfaces (full-screen overlays, same as History entry points) ──
  if (selected && materialContext.length >= 20) {
    if (tool === 'chat') {
      return (
        <ChatScreen
          contextText={materialContext}
          sourceFile={null}
          onClose={onClose}
        />
      );
    }
    if (tool === 'visualization') {
      return (
        <VisualizationModal
          questions={selected.questions}
          title={selected.title}
          quizId={selected.quizId || undefined}
          materialContext={materialContext}
          onClose={onClose}
        />
      );
    }
    return (
      <MaterialOverviewModal
        questions={selected.questions}
        result={selected.result}
        title={selected.title}
        quizId={selected.quizId || undefined}
        initialAiData={selected.aiOverviewData}
        materialContext={materialContext}
        onClose={onClose}
      />
    );
  }

  // ── Picker ──
  return (
    <div className="w-full max-w-2xl mx-auto pb-28">
      <div className="flex items-start gap-3 mb-6">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800"
          aria-label={t('back')}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
            <Icon size={20} />
            <span className="text-xs font-bold uppercase tracking-wider">{t(meta.titleKey)}</span>
          </div>
          <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">
            {isId ? 'Pilih sumber belajar' : 'Choose a study source'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(meta.descKey)}{' '}
            {isId
              ? '— pilih kuis dari Files agar tool ini terhubung ke materi & soal yang benar.'
              : '— pick a quiz from Files so this tool uses the real material and questions.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center text-indigo-500">
          <Loader2 className="animate-spin mb-3" size={28} />
          <p className="text-sm font-medium">{isId ? 'Memuat kuis tersimpan…' : 'Loading saved quizzes…'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessionUsable && (
            <button
              type="button"
              onClick={pickSession}
              className="w-full text-left p-4 rounded-2xl border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                    {isId ? 'Sesi aktif' : 'Active session'}
                  </p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                    {sessionPack.title || quizTitle(sessionPack)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {(sessionPack.questions || []).length}{' '}
                    {isId ? 'soal' : 'questions'}
                    {sessionPack.libraryContext
                      ? isId
                        ? ' · ada materi library'
                        : ' · library material attached'
                      : ''}
                  </p>
                </div>
                <Check className="text-indigo-500 shrink-0" size={20} />
              </div>
            </button>
          )}

          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isId ? 'Cari di Files…' : 'Search Files…'}
              className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40">
              <FolderOpen className="mx-auto text-slate-400 mb-3" size={32} />
              <p className="font-bold text-slate-700 dark:text-slate-200">
                {isId ? 'Belum ada kuis tersimpan' : 'No saved quizzes yet'}
              </p>
              <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                {isId
                  ? 'Generate kuis di Home dulu, lalu buka tool ini lagi — atau buka dari Files (tombol Simulation / Concept map).'
                  : 'Generate a quiz on Home first, then open this tool again — or launch from Files (Simulation / Concept map).'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((row) => {
                const n = row.questions?.length || 0;
                const hasLib = Boolean(String(row.libraryContext || '').trim());
                const weak = n === 0 && String(row.libraryContext || '').trim().length < 50;
                return (
                  <li key={String(row.id)}>
                    <button
                      type="button"
                      disabled={weak}
                      onClick={() => pickHistory(row)}
                      className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                        weak
                          ? 'border-slate-100 dark:border-slate-800 opacity-50 cursor-not-allowed'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30'
                      }`}
                    >
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                        {quizTitle(row)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {n} {isId ? 'soal' : 'questions'}
                        {hasLib ? (isId ? ' · materi' : ' · material') : ''}
                        {row.lastScore != null ? ` · ${row.lastScore}%` : ''}
                      </p>
                      {weak && (
                        <p className="text-[11px] text-rose-500 mt-1">
                          {isId
                            ? 'Tidak cukup materi untuk tool ini'
                            : 'Not enough material for this tool'}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
