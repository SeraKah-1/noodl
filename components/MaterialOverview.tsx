import { t, getLocale } from '../services/i18n';
import { PageHeader } from './PageHeader';
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Question, QuizResult, DeepInsightData } from '../types';
import { Sparkles, Download, Loader2, ChevronRight, ChevronLeft, CheckCircle, XCircle, Info, Hash } from 'lucide-react';
import { exportDeepInsightToPDF, exportOverviewToPDF } from '../services/pdfExportService';

interface MaterialOverviewProps {
  questions: Question[];
  result?: QuizResult | null;
  title: string;
  quizId?: number | string;
  onGenerateAI?: () => Promise<void>;
  aiOverviewData?: DeepInsightData | null;
  isGeneratingAI?: boolean;
  aiProgress?: { current: number; total: number };
  materialContext?: string;
  initialVisualizations?: { blueprints: any[], results: any[] };
  onSaveVisualizations?: (blueprints: any[], results: any[]) => void;
}

export const MaterialOverview: React.FC<MaterialOverviewProps> = ({
  questions,
  result,
  title,
  quizId,
  onGenerateAI,
  aiOverviewData,
  isGeneratingAI,
  aiProgress,
  materialContext,
  initialVisualizations,
  onSaveVisualizations
}) => {
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Non-AI Logic: Cluster and sort questions
  const groupedData = useMemo(() => {
    if (aiOverviewData) return null; // Skip if using AI text
    
    const groups: Record<string, {
      priority: string,
      questions: Question[],
      totalAnswers: number,
      correctAnswers: number
    }> = {};

    questions.forEach((q, idx) => {
      const topic = q.conceptName || q.keyPoint || 'Konsep Umum';
      const priority = q.conceptPriority || 'MODERATE';
      if (!groups[topic]) {
        groups[topic] = { priority, questions: [], totalAnswers: 0, correctAnswers: 0 };
      }
      groups[topic].questions.push(q);
      
      // Calculate stats if result exists
      if (result && result.answers[idx]) {
        groups[topic].totalAnswers++;
        if (result.answers[idx].isCorrect) {
          groups[topic].correctAnswers++;
        }
      }
    });

    return groups;
  }, [questions, result, aiOverviewData]);

  // Priority styling map for Callouts
  const getCalloutStyles = (priority: string) => {
    switch (priority) {
      case 'HIGH': return { wrapper: 'border-l-4 border-l-rose-500 bg-rose-50/60 border border-rose-100', text: 'text-rose-700', badge: 'bg-rose-500', label: 'HIGH-YIELD' };
      case 'MODERATE': return { wrapper: 'border-l-4 border-l-blue-500 bg-blue-50/40 border border-blue-100', text: 'text-blue-700', badge: 'bg-blue-500', label: 'MODERATE' };
      case 'FILLER': return { wrapper: 'border-l-4 border-l-slate-400 bg-slate-50/80 border border-slate-200', text: 'text-slate-600', badge: 'bg-slate-400', label: 'FILLER' };
      default: return { wrapper: 'border-l-4 border-l-blue-500 bg-blue-50/40 border border-blue-100', text: 'text-blue-700', badge: 'bg-blue-500', label: 'MODERATE' };
    }
  };

  const sortedTopics = useMemo(() => {
    if (!groupedData) return [];
    const priorityWeight: Record<string, number> = { 'HIGH': 3, 'MODERATE': 2, 'FILLER': 1 };
    return Object.keys(groupedData).sort((a, b) => {
       const wA = priorityWeight[groupedData[a].priority] || 2;
       const wB = priorityWeight[groupedData[b].priority] || 2;
       if (wA !== wB) return wB - wA; // HIGH first
       return a.localeCompare(b);
    });
  }, [groupedData]);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      if (aiOverviewData) {
        await exportDeepInsightToPDF(aiOverviewData, title);
      } else if (groupedData) {
        await exportOverviewToPDF(groupedData, questions, result, title);
      }
    } catch (err) {
      console.error('PDF Export Error:', err);
      alert('PDF export failed. Try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            {t('conceptMapTitle')}
          </h2>
          <p className="text-sm text-slate-500 font-medium">{title}</p>
        </div>
        
        <div className="flex items-center gap-3">
          {onGenerateAI && (
            <button 
              onClick={onGenerateAI}
              disabled={isGeneratingAI}
              className="flex items-center px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors border border-indigo-100 shadow-sm disabled:opacity-50"
            >
              {isGeneratingAI ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
              {isGeneratingAI
                ? t('analyzingAi')
                : aiOverviewData
                  ? t('regenerateAi')
                  : t('deepInsightBtn')}
            </button>
          )}
          
          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />}
            {isExporting ? t('makingPdf') : 'Export PDF'}
          </button>
        </div>
      </div>

      <div id="material-overview-content" className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 rounded-[2rem] p-6 sm:p-8 shadow-xl shadow-indigo-500/5">
        
        {/* Header for PDF only, hidden in UI usually but let's keep it clean */}
        <div className="hidden print:block mb-8 border-b-2 border-slate-200 pb-4">
           <PageHeader title={t('pageMaterialTitle')} purpose={t('pageMaterialPurpose')} />
           <p className="text-slate-600 font-medium">Topik: {title} • Generated by Noodl ( •_•)⌐■-■</p>
        </div>

        {isGeneratingAI ? (
           <div className="py-20 flex flex-col items-center justify-center text-indigo-500">
              <Loader2 size={40} className="animate-spin mb-4" />
              <p className="font-bold">{t('analyzingAiLong')}</p>
              {aiProgress && (
                <div className="w-64 bg-slate-200 rounded-full h-2 mt-4 overflow-hidden">
                   <div 
                     className="bg-indigo-500 h-full transition-all duration-300"
                     style={{ width: `${(aiProgress.current / aiProgress.total) * 100}%` }}
                   />
                </div>
              )}
              <p className="text-sm opacity-70 mt-2">
                ( ˘ ³˘)♥ {aiProgress ? `(${aiProgress.current}/${aiProgress.total})` : ''}
              </p>
           </div>
        ) : aiOverviewData ? (
          // NEW HYBRID SCROLL CARDS UI
          <div className="flex flex-col gap-6">
            
            {/* Topic jump links — NOT sticky (sticky inside nested overflow left ghost layers) */}
            <div className="p-3 rounded-2xl border border-slate-200 bg-white/80 dark:bg-slate-900/80 shadow-sm flex gap-2 overflow-x-auto hide-scrollbar">
               {Object.values(aiOverviewData.topics).map((topicItem, idx) => {
                 const isHigh = topicItem.priority === 'HIGH';
                 return (
                   <a
                     href={`#ai-topic-${idx}`}
                     key={`nav-${idx}-${topicItem.topic}`}
                     className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isHigh ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                   >
                     {isHigh ? '🔴' : '🔵'} {topicItem.topic}
                   </a>
                 );
               })}
            </div>

            {/* OVERALL SUMMARY CARD */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-2xl border border-indigo-100">
                <h3 className="font-black text-indigo-900 mb-3 text-lg flex items-center">
                  <Sparkles size={20} className="mr-2 text-indigo-500" /> {t('overallAnalysis')}
                </h3>
                <p className="text-slate-700 leading-relaxed mb-4">{aiOverviewData.summary.overallAssessment}</p>
                <div className="bg-white/60 p-4 rounded-xl">
                   <p className="text-sm font-bold text-slate-800 mb-1">🎯 {t('studyPlan')}:</p>
                   <p className="text-sm text-slate-600">{aiOverviewData.summary.studyPlan}</p>
                </div>
            </div>

            {/* CONCEPT CARDS — avoid shadowing i18n `t` */}
            {Object.values(aiOverviewData.topics).map((card, idx) => {
               const style = getCalloutStyles(card.priority);
               return (
                 <div id={`ai-topic-${idx}`} key={`topic-${idx}-${card.topic}`} className={`scroll-mt-4 p-6 rounded-2xl ${style.wrapper} shadow-sm`}>
                    <div className="flex justify-between items-start mb-4 border-b border-slate-200/50 pb-4">
                       <div>
                         <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black tracking-wider text-white mb-2 ${style.badge}`}>
                           {style.label}
                         </span>
                         <h2 className={`text-2xl font-black ${style.text}`}>{card.topic}</h2>
                       </div>
                       {card.accuracy !== null && (
                         <div className="bg-white/80 px-3 py-1.5 rounded-lg font-bold text-sm shadow-sm">
                           {t('scoreLabel')}: <span className={card.accuracy >= 70 ? 'text-emerald-600' : 'text-rose-600'}>{card.accuracy}%</span>
                         </div>
                       )}
                    </div>

                    <div className="space-y-6">
                       <div>
                         <h4 className="font-bold text-slate-800 mb-2 flex items-center text-sm">
                           <span className="mr-2 opacity-50">👓</span> {t('whatIsThis')}
                         </h4>
                         <p className="text-slate-600 text-sm leading-relaxed">{card.summary}</p>
                       </div>

                       <div>
                         <h4 className="font-bold text-slate-800 mb-2 flex items-center text-sm">
                           <span className="mr-2 opacity-50">💡</span> {t('keyInsights')}
                         </h4>
                         <ul className="space-y-3">
                           {card.insights.map((ins, i) => (
                             <li key={i} className="bg-white/60 p-3 rounded-xl border border-slate-100 text-sm">
                                <strong className="text-slate-800">{ins.point}</strong>
                                {ins.evidence && <p className="text-slate-500 mt-1">{ins.evidence}</p>}
                                {ins.formula && (
                                  <div className="mt-2 bg-slate-800 text-emerald-400 p-2 rounded-lg font-mono text-xs overflow-x-auto">
                                    {ins.formula}
                                  </div>
                                )}
                             </li>
                           ))}
                         </ul>
                       </div>

                       {card.traps && card.traps.length > 0 && (
                         <div>
                           <h4 className="font-bold text-rose-700 mb-2 flex items-center text-sm">
                             <span className="mr-2">⚠️</span> {t('commonTraps')}
                           </h4>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                             {card.traps.map((trap, i) => (
                               <div key={i} className="bg-rose-50 p-3 rounded-xl border border-rose-100 text-sm">
                                 <div className="text-rose-600 line-through decoration-rose-300 mb-1">{trap.trap}</div>
                                 <div className="text-emerald-700 font-medium">✨ {trap.correction}</div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}

                       <div className={`p-4 rounded-xl font-medium text-sm flex items-start ${card.priority === 'HIGH' ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800'}`}>
                         <span className="mr-2 text-lg">💎</span>
                         <div>
                           <div className="text-xs font-bold opacity-70 mb-0.5 uppercase tracking-wide">{t('rememberThis')}:</div>
                           {card.mnemonic}
                         </div>
                       </div>
                    </div>
                 </div>
               );
            })}
          </div>
        ) : (
          // CORNELL LAYOUT (Non-AI)
          <div className="flex flex-col md:flex-row gap-6 items-start relative">
            
            {/* CUE COLUMN (Sidebar) */}
            <div className={`transition-all duration-300 ease-in-out shrink-0 sticky top-20 z-10 
                            ${isSidebarOpen ? 'w-full md:w-64 opacity-100' : 'w-0 opacity-0 overflow-hidden hidden md:block'}`}>
               <div className="bg-white/80 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm max-h-[75vh] overflow-y-auto">
                  <h3 className="font-black text-slate-800 dark:text-slate-200 mb-3 text-sm flex items-center">
                    <Hash size={16} className="mr-2 opacity-50" /> {t('materialIndex')}
                  </h3>
                  <div className="space-y-1">
                     {sortedTopics.map(topic => {
                        const group = groupedData![topic];
                        const style = getCalloutStyles(group.priority);
                        return (
                          <a href={`#topic-${topic.replace(/\s+/g, '-')}`} key={topic} 
                             className="block px-3 py-2 text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group">
                             <div className="flex items-center">
                               <div className={`w-2 h-2 rounded-full mr-2 shrink-0 ${style.badge}`}></div>
                               <span className="truncate text-slate-700 dark:text-slate-300 group-hover:text-indigo-600">{topic}</span>
                             </div>
                             {group.totalAnswers > 0 && (
                                <div className="pl-4 text-[10px] text-slate-500 mt-0.5">
                                   {t('scoreLabel')}: {Math.round((group.correctAnswers/group.totalAnswers)*100)}%
                                </div>
                             )}
                          </a>
                        );
                     })}
                  </div>
               </div>
            </div>

            {/* TOGGLE BUTTON */}
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden md:flex absolute -left-3 top-2 w-6 h-12 bg-white border border-slate-200 rounded-full items-center justify-center shadow-sm z-20 text-slate-400 hover:text-indigo-600 transition-colors"
            >
              {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>

            {/* MAIN CONTENT (Callouts) */}
            <div className="flex-1 space-y-6 min-w-0 w-full">
              {sortedTopics.map((topic, idx) => {
                const data = groupedData![topic];
                const accuracy = data.totalAnswers > 0 ? Math.round((data.correctAnswers / data.totalAnswers) * 100) : null;
                const style = getCalloutStyles(data.priority);
                
                return (
                  <div id={`topic-${topic.replace(/\s+/g, '-')}`} key={idx} className={`scroll-mt-24 rounded-2xl p-5 md:p-6 ${style.wrapper}`}>
                    {/* CALLOUT HEADER */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 border-b border-slate-200/50 pb-3">
                       <div>
                         <div className="flex items-center gap-2 mb-1">
                           <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider text-white ${style.badge}`}>
                             {style.label}
                           </span>
                         </div>
                         <h3 className={`text-xl font-black ${style.text} leading-tight`}>
                           {topic}
                         </h3>
                       </div>
                       
                       {accuracy !== null && (
                         <div className="flex items-center bg-white/60 px-3 py-1.5 rounded-lg border border-slate-200 shrink-0">
                           <span className="text-sm font-bold text-slate-600 mr-2">Penguasaan:</span>
                           <span className={`text-lg font-black ${accuracy >= 70 ? 'text-emerald-600' : 'text-rose-600'}`}>{accuracy}%</span>
                         </div>
                       )}
                    </div>

                    {/* QUESTIONS BLOCK */}
                    <div className="space-y-4">
                      {data.questions.map((q, qIdx) => {
                        const answerObj = result ? result.answers.find(a => a.questionId === q.id) : null;
                        const isCorrect = answerObj ? answerObj.isCorrect : true; // Assume true if no result (preview)

                        return (
                          <div key={qIdx} className="bg-white/80 rounded-xl p-4 shadow-sm border border-slate-200/50">
                             <p className="text-slate-800 font-medium text-sm leading-relaxed mb-2">
                               {q.text}
                             </p>
                             
                             {answerObj && (
                               isCorrect ? (
                                 <details className="mt-2 group">
                                    <summary className="text-emerald-600 font-bold text-xs flex items-center cursor-pointer list-none hover:text-emerald-700 transition-colors">
                                      <CheckCircle size={14} className="mr-1" /> 
                                      {t('correctAnswer')} <span className="ml-2 text-[10px] opacity-70 group-open:hidden">({getLocale() === 'id' ? 'klik untuk lihat penjelasan' : 'click for explanation'})</span>
                                    </summary>
                                    <div className="mt-2 text-xs text-slate-600 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 leading-relaxed">
                                      <strong className="block text-slate-800 mb-1">{q.options[q.correctIndex]}</strong>
                                      {q.explanation}
                                    </div>
                                 </details>
                               ) : (
                                 <details className="mt-2 group" open>
                                    <summary className="text-rose-600 font-bold text-xs flex items-center cursor-pointer list-none">
                                      <XCircle size={14} className="mr-1" /> 
                                      Salah — <span className="font-normal truncate ml-1">{q.options[answerObj.selectedIndex]}</span>
                                    </summary>
                                    <div className="mt-2 bg-rose-50 border border-rose-100 rounded-lg p-3">
                                       <div className="flex items-start text-xs mb-2">
                                          <CheckCircle size={14} className="text-emerald-500 mr-1.5 mt-0.5 shrink-0" />
                                          <div>
                                            <span className="text-slate-500 font-medium block">Seharusnya:</span>
                                            <span className="font-bold text-slate-800">{q.options[q.correctIndex]}</span>
                                          </div>
                                       </div>
                                       <div className="bg-white p-2.5 rounded border border-rose-100">
                                          <h5 className="text-[10px] font-black text-indigo-600 mb-1 uppercase tracking-wider flex items-center">
                                             <Info size={12} className="mr-1" /> Insight
                                          </h5>
                                          <p className="text-slate-700 text-xs leading-relaxed">{q.explanation}</p>
                                       </div>
                                    </div>
                                 </details>
                               )
                             )}

                             {!result && (
                                <div className="mt-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                   <strong className="text-indigo-600 block mb-1">Kunci: {q.options[q.correctIndex]}</strong>
                                   {q.explanation}
                                </div>
                             )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* KEY TAKEAWAY FOOTER (Placeholder for Future AI Summary per topic) */}
                    {aiOverviewData && (
                       <div className="mt-4 pt-3 border-t border-slate-200/50">
                         <p className="text-xs font-medium text-slate-600 italic flex items-center">
                           <Sparkles size={12} className="mr-1 text-amber-500" /> Insight AI tersedia di atas.
                         </p>
                       </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        )}
        
      </div>


    </div>
  );
};
