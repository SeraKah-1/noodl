import React, { useEffect, useState } from 'react';
import { 
  Home, FolderOpen, Settings, Brain, Shuffle, 
  MessageSquare, Sparkles, BookOpen, Grid, X 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppView } from '../types';
import { t, subscribeLocale } from '../services/i18n';

interface NavigationProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, onChangeView }) => {
  const [isHubOpen, setIsHubOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => subscribeLocale(() => tick((n) => n + 1)), []);

  const mainTabs = [
    { id: AppView.GENERATOR, icon: Home, label: t('navHome') },
    { id: AppView.VIRTUAL_ROOM, icon: Shuffle, label: t('navMix') },
    { id: AppView.NEURO_SYNC, icon: Brain, label: t('navSync') },
    { id: AppView.WORKSPACE, icon: FolderOpen, label: t('navFiles') },
    { id: AppView.SETTINGS, icon: Settings, label: t('navSettings') },
  ];

  const allRouters = [
    { id: AppView.GENERATOR, icon: Home, label: 'Home', desc: 'AI quiz generator from your notes' },
    { id: AppView.WORKSPACE, icon: FolderOpen, label: 'Workspace & File', desc: 'Saved quizzes & materials' },
    { id: AppView.NEURO_SYNC, icon: Brain, label: 'NeuroSync SRS', desc: 'Spaced-repetition reviews' },
    { id: AppView.VIRTUAL_ROOM, icon: Shuffle, label: 'Mix Room', desc: 'Blend saved quizzes into one run' },
    { id: AppView.CHAT, icon: MessageSquare, label: 'AI Study Tutor', desc: 'Chat with your material' },
    { id: AppView.VISUALIZATION, icon: Sparkles, label: 'Visual Lab & Sim', desc: 'Diagrams & visual explainers' },
    { id: AppView.MATERIAL_OVERVIEW, icon: BookOpen, label: 'Material Bank', desc: 'Deep insights from materials' },
    { id: AppView.SETTINGS, icon: Settings, label: 'System Settings', desc: 'AI providers, keys & prefs' },
  ];

  const handleSelectView = (view: AppView) => {
    onChangeView(view);
    setIsHubOpen(false);
  };

  return (
    <>
      {/* ── MAIN FLOATING NAVBAR ── */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-4">
        <div className="bg-theme-glass backdrop-blur-2xl border border-theme-border rounded-2xl shadow-2xl shadow-theme-primary/10 p-1.5 flex justify-between items-center gap-1">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentView === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectView(tab.id as AppView)}
                className={`
                  relative flex flex-col items-center justify-center w-full py-2 rounded-xl transition-all duration-300 min-h-[44px]
                  ${isActive 
                    ? 'text-theme-primary bg-theme-primary/10 font-bold' 
                    : 'text-theme-muted hover:text-theme-primary hover:bg-theme-glass'}
                `}
              >
                <div className={`relative ${isActive ? 'transform -translate-y-0.5' : ''} transition-transform duration-300`}>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  {isActive && (
                    <span className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-theme-primary rounded-full" />
                  )}
                </div>
                <span className={`text-[9px] mt-1 ${isActive ? 'opacity-100 font-bold' : 'opacity-80'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* 9 ROUTERS HUB TRIGGER BUTTON */}
          <button
            onClick={() => setIsHubOpen(true)}
            className={`
              relative flex flex-col items-center justify-center px-3 py-2 rounded-xl transition-all duration-300 min-h-[44px] shrink-0
              ${isHubOpen 
                ? 'text-indigo-400 bg-indigo-500/20 font-bold ring-1 ring-indigo-500/40' 
                : 'text-indigo-400 hover:bg-indigo-500/10'}
            `}
            title="Buka 9 Router Hub"
          >
            <Grid size={20} />
            <span className="text-[9px] font-bold mt-1 uppercase">9 Hub</span>
          </button>
        </div>
      </div>

      {/* ── 9 ROUTERS HUB MODAL SHEET ── */}
      <AnimatePresence>
        {isHubOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn" onClick={() => setIsHubOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-theme-bg/95 backdrop-blur-2xl border border-theme-border rounded-3xl p-6 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-theme-border">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                    <Grid size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-theme-text flex items-center gap-2">
                      Quick jump
                    </h2>
                    <p className="text-xs text-theme-muted">
                      Jump to any Noodl module.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsHubOpen(false)}
                  className="p-2 rounded-xl bg-theme-glass border border-theme-border text-theme-muted hover:text-theme-text"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {allRouters.map((r) => {
                  const Icon = r.icon;
                  const isActive = currentView === r.id;

                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSelectView(r.id)}
                      className={`
                        p-4 rounded-2xl text-left border transition-all duration-200 flex flex-col justify-between space-y-3 relative group
                        ${isActive 
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400' 
                          : 'bg-theme-glass border-theme-border text-theme-text hover:border-indigo-500/40 hover:bg-theme-bg'}
                      `}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`p-2.5 rounded-xl ${isActive ? 'bg-white/20 text-white' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>
                          <Icon size={20} />
                        </div>
                        {isActive && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
                            Aktif
                          </span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm leading-tight mb-1">{r.label}</h4>
                        <p className={`text-[11px] leading-relaxed line-clamp-2 ${isActive ? 'text-white/80' : 'text-theme-muted'}`}>
                          {r.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
