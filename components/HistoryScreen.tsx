import { PageHeader } from './PageHeader';
import { t, subscribeLocale } from '../services/i18n';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Search, Layout, TrendingUp, Skull, Play, Trash2, Tag, Download, Book, ChevronDown, ChevronUp, Share2, Filter, AlertCircle, CheckCircle2, Clock, Folder, RefreshCw, FileText, Edit3, FolderInput, CloudLightning, Sparkles, FileJson, FileSpreadsheet, Printer, Network } from 'lucide-react';
import { auth } from '../supabase';
import { VisualizationModal } from './VisualizationModal';
import { GraphViewPanel } from './GraphViewPanel';
import { CollapsibleSection } from './CollapsibleSection';
import { 
  getSavedQuizzes, deleteQuiz,
  uploadQuizToCloud, downloadQuizFromCloud, getCloudQuizzes, subscribeToQuizzes,
  moveQuizToFolder, renameFolder
} from '../services/storageService';
import { exportBankSoalJSON, exportBankSoalCSV, exportBankSoalPDF } from '../services/bankSoalExportService';
import { QuizMode, Question } from '../types';
import { MaterialOverviewModal } from './MaterialOverviewModal';

interface HistoryScreenProps {
  onLoadHistory: (quiz: any) => void;
  onStartFlashcards: (questions: Question[]) => void;
  onImportQuiz: (file: File) => void;
}

const getModeBadge = (mode: string) => {
  switch(mode) {
    case QuizMode.SURVIVAL: return { icon: Skull, label: 'Survival', color: 'bg-rose-100 text-rose-600 border-rose-200' };
    case QuizMode.SCAFFOLDING: return { icon: TrendingUp, label: 'Bertahap', color: 'bg-blue-100 text-blue-600 border-blue-200' };
    default: return { icon: Layout, label: 'Standard', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' };
  }
};

const getScoreColor = (score: number | null) => {
  if (score === null || score === undefined) return "bg-slate-100 text-slate-500 border-slate-200";
  if (score >= 80) return "bg-emerald-100 text-emerald-600 border-emerald-200";
  if (score >= 60) return "bg-indigo-100 text-indigo-600 border-indigo-200";
  return "bg-rose-100 text-rose-600 border-rose-200";
};

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ onLoadHistory, onStartFlashcards }) => {
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Quiz Specific States
  const [viewMode, setViewMode] = useState<'local' | 'cloud'>('local');
  const [cloudFilter, setCloudFilter] = useState<'public' | 'mine'>('public');
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'survival' | 'low_score' | 'new'>('all');
  const [sortOption, setSortOption] = useState<'date_desc' | 'date_asc' | 'score_desc' | 'score_asc'>('date_desc');
  const [showFilters, setShowFilters] = useState(false);

  const [uploadModal, setUploadModal] = useState<{ quiz: any, isOpen: boolean, shareLink: string | null }>({ quiz: null, isOpen: false, shareLink: null });
  const [overviewModal, setOverviewModal] = useState<{ isOpen: boolean, quiz: any | null }>({ isOpen: false, quiz: null });
  const [visualizationModal, setVisualizationModal] = useState<{ isOpen: boolean, quiz: any | null }>({ isOpen: false, quiz: null });
  const [graphViewModal, setGraphViewModal] = useState<{ isOpen: boolean, quiz: any | null }>({ isOpen: false, quiz: null });
  
  // Folder States
  const [folderModal, setFolderModal] = useState<{ quizId: string | null, isOpen: boolean, currentFolder: string }>({ quizId: null, isOpen: false, currentFolder: '' });
  const [renameFolderModal, setRenameFolderModal] = useState<{ oldName: string, isOpen: boolean }>({ oldName: '', isOpen: false });
  const [newFolderName, setNewFolderName] = useState('');
  const [exportMenuQuizId, setExportMenuQuizId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      setCurrentUser(user);
      refreshQuizzes();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let unsub = () => {};
    
    if (viewMode === 'local') {
      setIsLoading(true);
      if (auth.currentUser) {
         unsub = subscribeToQuizzes((data) => {
            setQuizHistory(data);
            setIsLoading(false);
         });
      } else {
         getSavedQuizzes().then(data => {
            setQuizHistory(data);
            setIsLoading(false);
         });
      }
    } else {
      refreshCloudQuizzes();
    }
    
    return () => unsub();
  }, [viewMode, cloudFilter, currentUser]);

  const refreshCloudQuizzes = async () => {
    if (viewMode === 'cloud' && !auth.currentUser && cloudFilter === 'mine') {
      setQuizHistory([]);
      return;
    }

    setIsLoading(true);
    try {
      const data = await getCloudQuizzes(cloudFilter);
      setQuizHistory(data);
    } catch (err) {
      console.error("Refresh quizzes failed", err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshQuizzes = () => {
    if (viewMode === 'cloud') {
       refreshCloudQuizzes();
    }
    // Local mode handles its own refresh via subscription or initial fetch
  };

  const handleShareLink = async (quiz: any) => {
    setIsLoading(true);
    try {
      await uploadQuizToCloud(quiz);
      const link = `${window.location.origin}?share=${quiz.id}`;
      await navigator.clipboard.writeText(link);
      setUploadModal({ quiz, isOpen: true, shareLink: link });
    } catch (err: any) {
      alert("Gagal membuat link: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadQuiz = async (quiz: any) => {
    if (confirm("Download kuis ini ke penyimpanan lokal agar bisa dimainkan offline?")) {
       try {
          await downloadQuizFromCloud(quiz);
          alert("Kuis berhasil diunduh ke riwayat lokal!");
          refreshQuizzes();
       } catch (e) {
          alert("Gagal download: " + (e instanceof Error ? e.message : String(e)));
       }
    }
  };

  const handleUploadToCloud = async (quiz: any) => {
      try {
          await uploadQuizToCloud(quiz);
          alert("Kuis berhasil diupload ke Cloud!");
          refreshQuizzes();
      } catch (err: any) {
          alert(err.message || "Gagal mengupload kuis ke Cloud.");
      }
  };
  const handleMoveFolder = async () => {
      if (!folderModal.quizId) return;
      await moveQuizToFolder(folderModal.quizId, newFolderName);
      setFolderModal({ quizId: null, isOpen: false, currentFolder: '' });
      setNewFolderName('');
      refreshQuizzes();
  };

  const handleRenameFolder = async () => {
      if (!renameFolderModal.oldName) return;
      await renameFolder(renameFolderModal.oldName, newFolderName);
      setRenameFolderModal({ oldName: '', isOpen: false });
      setNewFolderName('');
      refreshQuizzes();
  };

  const filteredQuizzes = useMemo(() => {
    const filtered = quizHistory.filter(item => {
      if (searchQuery && !item.fileName?.toLowerCase().includes(searchQuery.toLowerCase()) && !item.topicSummary?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (activeFilter === 'survival' && item.mode !== QuizMode.SURVIVAL) return false;
      if (activeFilter === 'low_score' && (item.lastScore === null || item.lastScore >= 60)) return false;
      if (activeFilter === 'new' && item.lastScore !== null && item.lastScore !== undefined) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortOption === 'date_desc') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      } else if (sortOption === 'date_asc') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortOption === 'score_desc') {
        const scoreA = a.lastScore ?? -1;
        const scoreB = b.lastScore ?? -1;
        return scoreB - scoreA;
      } else if (sortOption === 'score_asc') {
        const scoreA = a.lastScore ?? -1;
        const scoreB = b.lastScore ?? -1;
        return scoreA - scoreB;
      }
      return 0;
    });
  }, [quizHistory, searchQuery, activeFilter, sortOption]);

  return (
    <div className="max-w-6xl mx-auto pt-8 pb-32 px-4 min-h-[90vh] text-theme-text flex flex-col font-sans">
      
      <PageHeader title={t('pageFilesTitle')} purpose={t('pageFilesPurpose')} />
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
          <div>
              <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center gap-3">
                  <History size={32} className="text-indigo-500" /> Riwayat Kuis
              </h1>
              <p className="text-slate-500 mt-2 font-medium">Buka kembali kuis lama kamu dan tingkatkan skormu.</p>
          </div>

          <div className="flex items-center gap-3">
              <div className="flex bg-theme-glass backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/60 shadow-sm w-full md:w-auto">
                  <button 
                      onClick={() => setViewMode('local')} 
                      className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === 'local' ? 'bg-white text-indigo-600 shadow-md transform scale-105' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                      Lokal
                  </button>
                  <button 
                      onClick={() => setViewMode('cloud')} 
                      className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${viewMode === 'cloud' ? 'bg-white text-emerald-600 shadow-md transform scale-105' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                      Cloud 
                  </button>
              </div>
              <button 
                onClick={refreshQuizzes} 
                className="p-3 bg-white border border-slate-200/60 shadow-sm rounded-2xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95" 
                title="Refresh Sinkronisasi"
              >
                  <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
              </button>
          </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-theme-glass backdrop-blur-md border border-slate-200/50 rounded-[2rem] p-4 md:p-6 mb-8 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="flex-1 relative w-full">
                  <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input 
                      type="text" 
                      placeholder="Cari topik atau nama materi kuis..." 
                      className="w-full pl-11 pr-4 py-3 bg-white/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm outline-none"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                  />
              </div>
              <button onClick={() => setShowFilters(!showFilters)} className="w-full md:w-auto px-4 py-3 flex items-center justify-center gap-2 bg-white/50 border border-slate-200 rounded-2xl text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">
                  <Filter size={18} /> Urutkan & Filter <ChevronDown size={16} className={`transform transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
          </div>

          <AnimatePresence>
              {showFilters && (
                  <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                  >
                      <div className="pt-4 mt-4 border-t border-slate-100 flex flex-col md:flex-row gap-6">
                            <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Urutkan Berdasarkan</label>
                                <select 
                                    className="w-full bg-white/50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500"
                                    value={sortOption}
                                    onChange={(e) => setSortOption(e.target.value as any)}
                                >
                                    <option value="date_desc">Terbaru</option>
                                    <option value="date_asc">Terlama</option>
                                    <option value="score_desc">Skor Tertinggi</option>
                                    <option value="score_asc">Skor Terendah</option>
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Filter Tipe</label>
                                <div className="flex gap-2 flex-wrap">
                                    {(['all', 'survival', 'low_score', 'new'] as const).map(type => (
                                        <button 
                                            key={type}
                                            onClick={() => setActiveFilter(type)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeFilter === type ? 'bg-indigo-600 text-white shadow-md' : 'bg-white/50 border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            {type === 'all' ? 'Semua' : type === 'survival' ? 'Survival' : type === 'low_score' ? '< 60 Skor' : 'Belum Dikerjakan'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                      </div>
                  </motion.div>
              )}
          </AnimatePresence>
      </div>

      {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-48 bg-theme-glass border border-slate-200/50 rounded-[2rem] animate-pulse"></div>
              ))}
          </div>
      ) : filteredQuizzes.length === 0 ? (
          <div className="text-center py-20 bg-theme-glass border-2 border-dashed border-slate-200 rounded-[3rem]">
              <History size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500 font-medium text-lg">No quizzes yet</p>
              <p className="text-sm text-slate-500 mt-2">Generate one from Home — it will show up here.</p>
          </div>
      ) : (
          <div className="space-y-10">
              {(Object.entries(
                  filteredQuizzes.reduce((acc: { [key: string]: any[] }, quiz) => {
                      const folder = (quiz.folder || 'Uncategorized').trim();
                      if (!acc[folder]) acc[folder] = [];
                      acc[folder].push(quiz);
                      return acc;
                  }, {} as { [key: string]: any[] })
              ) as [string, any[]][]).map(([folderName, quizzes], folderIdx) => (
                  <div key={`folder-${folderIdx}`} className="space-y-4">
                      <CollapsibleSection
                        title={folderName}
                        icon={<Folder size={18} />}
                        badge={`${quizzes.length}`}
                        defaultOpen={true}
                      >

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {(quizzes as any[]).map((quiz, idx) => {
                              const modeBadge = getModeBadge(quiz.mode);
                              const isNew = quiz.lastScore === null || quiz.lastScore === undefined;
                  const scoreClass = isNew ? "bg-slate-100 text-slate-600 border-slate-200" : getScoreColor(quiz.lastScore);

                  return (
                      <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          key={`${quiz.id}-${idx}`} 
                          className="group relative bg-white border border-slate-200/60 rounded-[2rem] p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                      >
                          <div className="absolute top-4 right-4 flex gap-2">
                              {viewMode === 'local' ? (
                                  <>
                                      <button onClick={() => { setFolderModal({ quizId: quiz.id, isOpen: true, currentFolder: folderName }); setNewFolderName(folderName === 'Uncategorized' ? '' : folderName); }} className="p-2 bg-amber-50 text-amber-600 rounded-full hover:bg-amber-100 transition-colors" title="Pindah Folder">
                                          <FolderInput size={16} />
                                      </button>
                                      <button onClick={() => handleUploadToCloud(quiz)} className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors" title="Upload ke Cloud">
                                          <CloudLightning size={16} />
                                      </button>
                                      <button onClick={() => handleShareLink(quiz)} className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors" title="Share via Link">
                                          <Share2 size={16} />
                                      </button>
                                      <button onClick={() => { if(confirm('Hapus Kuis?')) { deleteQuiz(quiz.id); refreshQuizzes(); } }} className="p-2 bg-rose-50 text-rose-600 rounded-full hover:bg-rose-100 transition-colors" title="Delete">
                                          <Trash2 size={16} />
                                      </button>
                                  </>
                              ) : (
                                  <button onClick={() => handleDownloadQuiz(quiz)} className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors" title="Download">
                                      <Download size={16} />
                                  </button>
                              )}
                          </div>
                          
                          <div className={`w-12 h-12 flex items-center justify-center rounded-2xl mb-4 ${isNew ? 'bg-slate-50 text-slate-400' : 'bg-indigo-50 text-indigo-500'}`}>
                              <Book size={24} />
                          </div>

                          <h3 className="font-bold text-lg text-slate-800 line-clamp-2 leading-tight mb-2 pr-12">{quiz.fileName || quiz.topicSummary || "Kuis Tanpa Judul"}</h3>
                          
                          <div className="flex flex-wrap gap-2 mb-6">
                              <span className={`text-xs px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1.5 ${modeBadge.color}`}>
                                  <modeBadge.icon size={12} /> {modeBadge.label}
                              </span>
                              <span className="text-xs text-slate-500 flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg">
                                  <Tag size={12} /> {quiz.questions?.length || 0} Soal
                              </span>
                          </div>

                          <div className="mt-auto space-y-4">
                              <div className="flex items-center justify-between text-sm border-t border-slate-100 pt-4">
                                  <span className="text-slate-500 flex items-center gap-1.5"><Clock size={14}/> {new Date(quiz.date || Date.now()).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'})}</span>
                                  <div className={`px-3 py-1 rounded-xl text-xs font-bold border ${scoreClass}`}>
                                      {isNew ? 'New' : `${quiz.lastScore}%`}
                                  </div>
                              </div>

                              <div className="flex gap-2">
                                  <button onClick={() => onLoadHistory(quiz)} className="flex-1 bg-slate-900 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-slate-200 hover:bg-slate-800 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
                                      <Play size={16} /> {isNew ? 'Mulai' : 'Ulangi'}
                                  </button>
                                  <button onClick={() => onStartFlashcards(quiz.questions || [])} className="bg-indigo-50 text-indigo-600 font-bold py-2.5 px-4 rounded-xl hover:bg-indigo-100 transition-colors" title="Flashcards">
                                      <Layout size={16} />
                                  </button>
                                  <button onClick={() => setOverviewModal({ isOpen: true, quiz })} className="bg-teal-50 text-teal-600 font-bold py-2.5 px-4 rounded-xl hover:bg-teal-100 transition-colors" title="Peta Pemahaman">
                                      <FileText size={16} />
                                  </button>
                                  <button onClick={() => setVisualizationModal({ isOpen: true, quiz })} className="bg-purple-50 text-purple-600 font-bold py-2.5 px-4 rounded-xl hover:bg-purple-100 transition-colors" title="Simulasi AI">
                                      <Sparkles size={16} />
                                  </button>
                                  <button onClick={() => setGraphViewModal({ isOpen: true, quiz })} className="bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 font-bold py-2.5 px-4 rounded-xl hover:from-indigo-100 hover:to-purple-100 transition-colors" title="Knowledge Graph">
                                      <Network size={16} />
                                  </button>
                                  {/* Export Bank Soal Button */}
                                  <div className="relative">
                                    <button 
                                      onClick={() => setExportMenuQuizId(exportMenuQuizId === quiz.id ? null : quiz.id)} 
                                      className="bg-amber-50 text-amber-600 font-bold py-2.5 px-4 rounded-xl hover:bg-amber-100 transition-colors" 
                                      title="Export Bank Soal"
                                    >
                                      <Download size={16} />
                                    </button>
                                    <AnimatePresence>
                                      {exportMenuQuizId === quiz.id && (
                                        <motion.div
                                          initial={{ opacity: 0, y: -4, scale: 0.95 }}
                                          animate={{ opacity: 1, y: 0, scale: 1 }}
                                          exit={{ opacity: 0, y: -4, scale: 0.95 }}
                                          className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50"
                                        >
                                          <div className="p-1.5">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1">Export Bank Soal</p>
                                            <button
                                              onClick={() => { exportBankSoalJSON(quiz.questions || [], quiz.fileName || quiz.topicSummary || 'Quiz'); setExportMenuQuizId(null); }}
                                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                                            >
                                              <FileJson size={14} /> JSON (Re-import)
                                            </button>
                                            <button
                                              onClick={() => { exportBankSoalCSV(quiz.questions || [], quiz.fileName || quiz.topicSummary || 'Quiz'); setExportMenuQuizId(null); }}
                                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-colors"
                                            >
                                              <FileSpreadsheet size={14} /> CSV (Spreadsheet)
                                            </button>
                                            <button
                                              onClick={() => { exportBankSoalPDF(quiz.questions || [], quiz.fileName || quiz.topicSummary || 'Quiz', { includeAnswers: true }); setExportMenuQuizId(null); }}
                                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-colors"
                                            >
                                              <Printer size={14} /> PDF (Dengan Jawaban)
                                            </button>
                                            <button
                                              onClick={() => { exportBankSoalPDF(quiz.questions || [], quiz.fileName || quiz.topicSummary || 'Quiz', { includeAnswers: false }); setExportMenuQuizId(null); }}
                                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                                            >
                                              <FileText size={14} /> PDF (Tanpa Jawaban)
                                            </button>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                              </div>
                          </div>
                          </motion.div>
                      );
                  })}
                      </div>
                      </CollapsibleSection>
                  </div>
              ))}
          </div>
      )}

      {/* UPLOAD MODAL */}
      {uploadModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2rem] shadow-2xl p-6 w-full max-w-md border border-slate-100 relative">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-center text-slate-800 mb-2">Link Berhasil Dibuat!</h3>
                  <p className="text-slate-500 text-center text-sm mb-6">Link kuis telah otomatis di-copy ke clipboard-mu.</p>
                  
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3 mb-6">
                      <input 
                          type="text" 
                          readOnly 
                          value={uploadModal.shareLink || ''} 
                          className="flex-1 bg-transparent text-sm text-slate-600 outline-none truncate"
                      />
                      <button onClick={() => { navigator.clipboard.writeText(uploadModal.shareLink || ''); }} className="px-3 py-1.5 bg-indigo-100 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-200">
                          Copy
                      </button>
                  </div>

                  <button onClick={() => setUploadModal({ quiz: null, isOpen: false, shareLink: null })} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors">
                      Selesai
                  </button>
              </motion.div>
          </div>
      )}


      {/* OVERVIEW MODAL */}
      {overviewModal.isOpen && overviewModal.quiz && (
          <MaterialOverviewModal 
              questions={overviewModal.quiz.questions || []} 
              title={overviewModal.quiz.fileName || overviewModal.quiz.title || "Peta Pemahaman"}
              quizId={overviewModal.quiz.id}
              initialAiData={overviewModal.quiz.aiOverviewData}
              materialContext={overviewModal.quiz.libraryContext}
              onClose={() => setOverviewModal({ isOpen: false, quiz: null })} 
          />
      )}

      {/* VISUALIZATION MODAL */}
      {visualizationModal.isOpen && visualizationModal.quiz && (
          <VisualizationModal 
              questions={visualizationModal.quiz.questions || []} 
              title={visualizationModal.quiz.fileName || visualizationModal.quiz.title || "Simulasi AI"}
              quizId={visualizationModal.quiz.id}
              materialContext={visualizationModal.quiz.libraryContext}
              onClose={() => setVisualizationModal({ isOpen: false, quiz: null })} 
          />
      )}

      {/* GRAPH VIEW MODAL */}
      {graphViewModal.isOpen && graphViewModal.quiz && (
          <GraphViewPanel 
              questions={graphViewModal.quiz.questions || []} 
              title={graphViewModal.quiz.fileName || graphViewModal.quiz.topicSummary || 'Knowledge Graph'}
              materialContext={graphViewModal.quiz.libraryContext}
              quizId={graphViewModal.quiz.id}
              onClose={() => setGraphViewModal({ isOpen: false, quiz: null })} 
          />
      )}

      {/* MOVE TO FOLDER MODAL */}
      {folderModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="text-xl font-bold text-slate-800 mb-4">Pindahkan Kuis</h3>
                  <label className="text-sm font-bold text-slate-500 mb-2 block">Nama Folder Baru/Lama</label>
                  <input 
                      type="text" 
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Contoh: Biologi Semester 2"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl mb-6 outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setFolderModal({ quizId: null, isOpen: false, currentFolder: '' })} className="flex-1 py-3 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
                      <button onClick={handleMoveFolder} className="flex-1 py-3 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">Simpan</button>
                  </div>
              </motion.div>
          </div>
      )}

      {/* RENAME FOLDER MODAL */}
      {renameFolderModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="text-xl font-bold text-slate-800 mb-4">Ganti Nama Folder</h3>
                  <label className="text-sm font-bold text-slate-500 mb-2 block">Nama Folder Baru</label>
                  <input 
                      type="text" 
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Nama folder baru..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl mb-6 outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-3">
                      <button onClick={() => setRenameFolderModal({ oldName: '', isOpen: false })} className="flex-1 py-3 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Batal</button>
                      <button onClick={handleRenameFolder} className="flex-1 py-3 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">Simpan</button>
                  </div>
              </motion.div>
          </div>
      )}

    </div>
  );
};
