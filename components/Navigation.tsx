import React, { useEffect, useRef, useState } from 'react';
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hubTriggerRef = useRef<HTMLButtonElement>(null);
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
    { id: AppView.GENERATOR, icon: Home, label: t('hubHome'), desc: t('hubHomeDesc') },
    { id: AppView.WORKSPACE, icon: FolderOpen, label: t('hubFiles'), desc: t('hubFilesDesc') },
    { id: AppView.NEURO_SYNC, icon: Brain, label: t('hubSync'), desc: t('hubSyncDesc') },
    { id: AppView.VIRTUAL_ROOM, icon: Shuffle, label: t('hubMix'), desc: t('hubMixDesc') },
    { id: AppView.CHAT, icon: MessageSquare, label: t('hubChat'), desc: t('hubChatDesc') },
    { id: AppView.VISUALIZATION, icon: Sparkles, label: t('hubVisual'), desc: t('hubVisualDesc') },
    { id: AppView.MATERIAL_OVERVIEW, icon: BookOpen, label: t('hubMaterial'), desc: t('hubMaterialDesc') },
    { id: AppView.SETTINGS, icon: Settings, label: t('hubSettings'), desc: t('hubSettingsDesc') },
  ];

  const handleSelectView = (view: AppView) => {
    onChangeView(view);
    setIsHubOpen(false);
  };

  useEffect(() => {
    if (!isHubOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsHubOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      hubTriggerRef.current?.focus();
    };
  }, [isHubOpen]);

  return (
    <>
      {/* ── MAIN FLOATING NAVBAR ── */}
      <nav aria-label="Primary" style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }} className="fixed left-1/2 transform -translate-x-1/2 z-50 w-full max-w-lg px-3 sm:px-4">
        <div className="bg-theme-glass backdrop-blur-2xl border border-theme-border rounded-2xl shadow-2xl shadow-theme-primary/10 p-1.5 flex justify-between items-center gap-1">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentView === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectView(tab.id as AppView)}
                aria-current={isActive ? 'page' : undefined}
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
            ref={hubTriggerRef}
            onClick={() => setIsHubOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isHubOpen}
            className={`
              relative flex flex-col items-center justify-center px-3 py-2 rounded-xl transition-all duration-300 min-h-[44px] shrink-0
              ${isHubOpen 
                ? 'text-indigo-400 bg-indigo-500/20 font-bold ring-1 ring-indigo-500/40' 
                : 'text-indigo-400 hover:bg-indigo-500/10'}
            `}
            title={t('hubDesc')}
          >
            <Grid size={20} />
            <span className="text-[9px] font-bold mt-1 uppercase">{t('navMore')}</span>
          </button>
        </div>
      </nav>

      {/* ── 9 ROUTERS HUB MODAL SHEET ── */}
      <AnimatePresence>
        {isHubOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn" onClick={() => setIsHubOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="module-hub-title"
              className="bg-theme-bg/95 backdrop-blur-2xl border border-theme-border rounded-3xl p-6 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto space-y-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-theme-border">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                    <Grid size={24} />
                  </div>
                  <div>
                    <h2 id="module-hub-title" className="text-xl font-black text-theme-text flex items-center gap-2">
                      {t('hubTitle')}
                    </h2>
                    <p className="text-xs text-theme-muted">
                      {t('hubDesc')}
                    </p>
                  </div>
                </div>
                <button
                  ref={closeButtonRef}
                  onClick={() => setIsHubOpen(false)}
                  aria-label={t('cancel')}
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
                            {t('active')}
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
