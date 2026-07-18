import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cpu, Key, Globe, RefreshCw, Check, AlertCircle, ShieldCheck, 
  User, Palette, Zap, Bell, Sparkles, Server, HardDrive, Lock, ExternalLink, Sliders
} from 'lucide-react';
import { 
  PROVIDER_CATALOG, 
  getActiveProvider, 
  setActiveProvider, 
  getProviderApiKey, 
  setProviderApiKey, 
  getProviderBaseUrl, 
  setProviderBaseUrl, 
  getCachedModels, 
  autoFetchModels 
} from '../services/providerService';
import { 
  saveSRSEnabled, 
  getSRSEnabled, 
  saveHandTrackingEnabled, 
  getHandTrackingEnabled,
  saveAdvancedHandsFree,
  getAdvancedHandsFree,
} from '../services/storageService';
import { useExperimentalSettings } from '../contexts/ExperimentalSettingsContext';
import { setWakelockRunning } from '../services/wakelockService';
import { requestKaomojiPermission } from '../services/kaomojiNotificationService';
import { scheduleDailyReminder, getReminderTime } from '../services/notificationService';
import { getSavedTheme } from '../services/themeService';
import { ThemeSelector } from './ThemeSelector';
import { AuthWidget } from './AuthWidget';
import { AiProvider, ModelOption, ThemeName } from '../types';
import { getLocale, setLocale, t, type Locale } from '../services/i18n';
import { PageHeader } from './PageHeader';

type SettingsTab = 'providers' | 'account' | 'appearance' | 'features' | 'notifications';

export const SettingsScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
  const [selectedProvider, setSelectedProvider] = useState<AiProvider>(getActiveProvider());
  const { isExperimentalEnabled, setExperimental } = useExperimentalSettings();
  
  // Provider Config States
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Model Fetching States
  const [modelsList, setModelsList] = useState<ModelOption[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchNotice, setFetchNotice] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // System & Performance States
  const [srsEnabled, setSrsEnabled] = useState(true);
  const [wakelockEnabled, setWakelockEnabled] = useState(true);
  const [gestureEnabled, setHandTrackingEnabled] = useState(false);
  const [dynamicIslandEnabled, setDynamicIslandEnabled] = useState(true);

  // Theme State
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(getSavedTheme());

  // Notification States
  const [reminderTime, setReminderTime] = useState('');
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    // Read notification & system states
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
    }
    const savedTime = getReminderTime();
    if (savedTime) setReminderTime(savedTime);

    setSrsEnabled(getSRSEnabled());
    setHandTrackingEnabled(getHandTrackingEnabled());

    // Load active provider settings
    loadProviderState(selectedProvider);
  }, []);

  const loadProviderState = (prov: AiProvider) => {
    const key = getProviderApiKey(prov) || '';
    const url = getProviderBaseUrl(prov);
    setApiKeyInput(key);
    setBaseUrlInput(url);
    setModelsList(getCachedModels(prov));
    setFetchNotice(null);
  };

  const handleProviderSelect = (prov: AiProvider) => {
    setSelectedProvider(prov);
    setActiveProvider(prov);
    loadProviderState(prov);
  };

  const handleSaveProviderConfig = () => {
    setProviderApiKey(selectedProvider, apiKeyInput.trim());
    setProviderBaseUrl(selectedProvider, baseUrlInput.trim());
    setSaveStatus(t('configSaved'));
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleAutoFetchModels = async () => {
    setIsFetchingModels(true);
    setFetchNotice(null);

    // Save first before fetching
    setProviderApiKey(selectedProvider, apiKeyInput.trim());
    setProviderBaseUrl(selectedProvider, baseUrlInput.trim());

    const res = await autoFetchModels(selectedProvider, apiKeyInput.trim(), baseUrlInput.trim());
    setIsFetchingModels(false);
    setModelsList(res.models);

    if (res.error) {
      setFetchNotice({ type: 'warning', message: res.error });
    } else {
      setFetchNotice({ type: 'success', message: t('modelsFetched').replace('{n}', String(res.models.length)) });
    }
  };

  const handleToggleSrs = (v: boolean) => {
    setSrsEnabled(v);
    saveSRSEnabled(v);
  };

  const handleToggleWakelock = (v: boolean) => {
    setWakelockEnabled(v);
    setWakelockRunning(v);
  };

  const handleRequestNotif = async () => {
    const granted = await requestKaomojiPermission();
    setNotifPermission(granted ? 'granted' : 'denied');
  };

  const handleSaveReminder = () => {
    if (notifPermission !== 'granted') {
      alert(t('confirmHuman'));
      return;
    }
    if (reminderTime) {
      scheduleDailyReminder(reminderTime);
      alert(t('reminderSet').replace('{time}', reminderTime));
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: any; badge?: string }[] = [
    { id: 'providers', label: t('tabProviders'), icon: Cpu },
    { id: 'account', label: t('tabAccount'), icon: User },
    { id: 'appearance', label: t('tabAppearance'), icon: Palette },
    { id: 'features', label: t('tabFeatures'), icon: Zap },
    { id: 'notifications', label: t('tabNotifications'), icon: Bell },
  ];

  const currentProviderCatalog = PROVIDER_CATALOG.find(p => p.id === selectedProvider) || PROVIDER_CATALOG[0];

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 animate-fadeIn">
      <PageHeader
        title={t('pageSettingsTitle')}
        purpose={t('pageSettingsPurpose')}
        right={
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-theme-glass border border-theme-border text-xs font-medium text-theme-text">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              {selectedProvider}
            </span>
          </div>
        }
      />

      {/* ── MAIN TWO-COLUMN LAYOUT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT NAVIGATION SIDEBAR (NO SLIDE BUG, STICKY & HIGH TOUCH TARGETS) */}
        <div className="lg:col-span-4 space-y-2 bg-theme-glass border border-theme-border rounded-3xl p-3 shadow-xl backdrop-blur-2xl">
          <p className="text-[11px] font-bold uppercase tracking-wider text-theme-muted px-4 py-2">
            {t('pageSettingsTitle')}
          </p>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  w-full flex items-center justify-between px-4 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200 min-h-[48px]
                  ${isActive 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 scale-[1.01]' 
                    : 'text-theme-muted hover:text-theme-text hover:bg-theme-bg/60 active:scale-98'}
                `}
              >
                <div className="flex items-center gap-3">
                  <Icon size={20} className={isActive ? 'text-white' : 'text-indigo-400'} />
                  <span>{tab.label}</span>
                </div>
                {tab.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-black ${isActive ? 'bg-white/20 text-white' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* RIGHT CONTENT PANEL */}
        <div className="lg:col-span-8 space-y-6">
          <AnimatePresence mode="wait">
            
            {/* ── TAB 1: AI PROVIDER & MODEL (CUSTOM ENDPOINT & AUTO-FETCH) ── */}
            {activeTab === 'providers' && (
              <motion.div
                key="providers"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Provider Selector Grid */}
                <div className="bg-theme-glass border border-theme-border rounded-3xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-theme-text flex items-center gap-2">
                      <Cpu className="text-indigo-500" size={20} />
                      {t('pickProvider')}
                    </h2>
                    <span className="text-xs text-theme-muted">Model Agnostik Protocol</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {PROVIDER_CATALOG.map((prov) => {
                      const isSelected = selectedProvider === prov.id;
                      return (
                        <button
                          key={prov.id}
                          onClick={() => handleProviderSelect(prov.id)}
                          className={`
                            p-4 rounded-2xl text-left border transition-all duration-200 relative overflow-hidden flex flex-col justify-between space-y-2
                            ${isSelected 
                              ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/30' 
                              : 'border-theme-border bg-theme-bg/40 hover:bg-theme-bg hover:border-theme-text/20'}
                          `}
                        >
                          <div className="flex items-start justify-between">
                            <span className="font-bold text-sm text-theme-text">{prov.name}</span>
                            {isSelected && (
                              <span className="p-1 rounded-full bg-indigo-500 text-white shrink-0">
                                <Check size={14} />
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-theme-muted leading-relaxed line-clamp-2">
                            {prov.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Provider Details & Key/Base URL Config */}
                <div className="bg-theme-glass border border-theme-border rounded-3xl p-6 shadow-xl space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-theme-border">
                    <div>
                      <h3 className="font-bold text-base text-theme-text flex items-center gap-2">
                        Konfigurasi {currentProviderCatalog.name}
                      </h3>
                      <p className="text-xs text-theme-muted mt-0.5">
                        Paste the API key for this provider. Change Base URL only if you use a proxy or local server.
                      </p>
                    </div>
                    <a
                      href={currentProviderCatalog.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-indigo-400 hover:underline flex items-center gap-1 shrink-0"
                    >
                      Get key <ExternalLink size={12} />
                    </a>
                  </div>

                  <div className="space-y-4">
                    {/* API Key Input — provider-agnostic copy */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-theme-text flex items-center justify-between">
                        <span>
                          API key{' '}
                          {currentProviderCatalog.requiresKey ? '(required)' : '(optional)'}
                        </span>
                        {apiKeyInput && (
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                            <ShieldCheck size={12} /> Saved on this device
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          placeholder={
                            currentProviderCatalog.id === 'gemini'
                              ? 'Provider API key (e.g. AIza…)'
                              : currentProviderCatalog.id === 'anthropic'
                                ? 'sk-ant-…'
                                : 'sk-… or provider token'
                          }
                          className="w-full px-4 py-3 bg-theme-bg border border-theme-border rounded-xl text-sm text-theme-text focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-24 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs text-theme-muted hover:text-theme-text bg-theme-glass rounded-lg border border-theme-border"
                        >
                          {showApiKey ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>

                    {/* Custom Base URL Input */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-theme-text flex items-center justify-between">
                        <span>Base URL Endpoint API</span>
                        <span className="text-[10px] text-theme-muted">Default: {currentProviderCatalog.defaultBaseUrl}</span>
                      </label>
                      <input
                        type="text"
                        value={baseUrlInput}
                        onChange={(e) => setBaseUrlInput(e.target.value)}
                        placeholder={currentProviderCatalog.defaultBaseUrl}
                        className="w-full px-4 py-3 bg-theme-bg border border-theme-border rounded-xl text-sm text-theme-text focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <button
                        onClick={handleSaveProviderConfig}
                        className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all flex items-center gap-2"
                      >
                        <Check size={16} /> {t('saveConfig')}
                      </button>

                      <button
                        onClick={handleAutoFetchModels}
                        disabled={isFetchingModels}
                        className="px-5 py-3 bg-theme-bg border border-indigo-500/30 hover:border-indigo-500 text-indigo-400 hover:text-indigo-300 rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        <RefreshCw size={16} className={isFetchingModels ? 'animate-spin' : ''} />
                        {isFetchingModels ? t('fetchingModels') : '⚡ Auto-Fetch Available Models'}
                      </button>
                    </div>

                    {saveStatus && (
                      <p className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                        {saveStatus}
                      </p>
                    )}

                    {fetchNotice && (
                      <div className={`p-3.5 rounded-xl border text-xs font-medium flex items-start gap-2.5 ${
                        fetchNotice.type === 'success' 
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                          : fetchNotice.type === 'warning'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}>
                        <Sparkles size={16} className="shrink-0 mt-0.5" />
                        <span>{fetchNotice.message}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto-Fetched Models Catalog Grid */}
                <div className="bg-theme-glass border border-theme-border rounded-3xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-theme-text flex items-center gap-2">
                      <Server className="text-indigo-400" size={18} />
                      Model Terdaftar ({modelsList.length} Model)
                    </h3>
                    <span className="text-xs text-theme-muted font-mono uppercase">{selectedProvider}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                    {modelsList.map((m) => (
                      <div
                        key={m.id}
                        className="p-3 rounded-xl bg-theme-bg/60 border border-theme-border flex items-center justify-between text-xs"
                      >
                        <div className="font-mono text-theme-text font-medium truncate pr-2">
                          {m.label}
                        </div>
                        {m.isVision && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                            Vision
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── TAB 2: AKUN & CLOUD SYNC ── */}
            {activeTab === 'account' && (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="bg-theme-glass border border-theme-border rounded-3xl p-6 shadow-xl space-y-4">
                  <h2 className="text-lg font-bold text-theme-text flex items-center gap-2">
                    <User className="text-indigo-500" size={20} />
                    {t('accountTitle')}
                  </h2>
                  <p className="text-sm text-theme-muted">
                    {t('accountDesc')}
                  </p>
                  <AuthWidget />
                </div>
              </motion.div>
            )}

            {/* ── TAB 3: TAMPILAN & TEMA ── */}
            {activeTab === 'appearance' && (
              <motion.div
                key="appearance"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="bg-theme-glass border border-theme-border rounded-3xl p-6 shadow-xl space-y-4">
                  <h2 className="text-lg font-bold text-theme-text flex items-center gap-2">
                    <Globe className="text-indigo-500" size={20} />
                    {t('language')}
                  </h2>
                  <p className="text-sm text-theme-muted">
                    {t('languageHint')}
                  </p>
                  <div className="flex gap-2">
                    {([
                      { id: 'en' as Locale, label: 'English' },
                      { id: 'id' as Locale, label: 'Indonesia' },
                    ]).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setLocale(opt.id)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                          getLocale() === opt.id
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-theme-bg text-theme-text border-theme-border hover:border-indigo-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-theme-glass border border-theme-border rounded-3xl p-6 shadow-xl space-y-4">
                  <h2 className="text-lg font-bold text-theme-text flex items-center gap-2">
                    <Palette className="text-indigo-500" size={20} />
                    Theme
                  </h2>
                  <p className="text-sm text-theme-muted mb-4">
                    Pick a look that feels calm for long study sessions.
                  </p>
                  <ThemeSelector currentTheme={currentTheme} onThemeChange={setCurrentTheme} />
                </div>
              </motion.div>
            )}

            {/* ── TAB 4: PERFORMA & FITUR SYSTEM ── */}
            {activeTab === 'features' && (
              <motion.div
                key="features"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="bg-theme-glass border border-theme-border rounded-3xl p-6 shadow-xl space-y-6">
                  <h2 className="text-lg font-bold text-theme-text flex items-center gap-2">
                    <Zap className="text-indigo-500" size={20} />
                    {t('tabFeatures')}
                  </h2>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-theme-bg/60 border border-theme-border">
                    <div>
                      <h4 className="font-bold text-sm text-theme-text">{t('featuresSrs')}</h4>
                      <p className="text-xs text-theme-muted mt-0.5">
                        Save missed cards for spaced review.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={srsEnabled}
                      onChange={(e) => handleToggleSrs(e.target.checked)}
                      className="w-5 h-5 accent-indigo-600 rounded cursor-pointer shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl bg-theme-bg/60 border border-theme-border">
                    <div>
                      <h4 className="font-bold text-sm text-theme-text">{t('featuresWakelock')}</h4>
                      <p className="text-xs text-theme-muted mt-0.5">
                        Prevent screen sleep during quizzes.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={wakelockEnabled}
                      onChange={(e) => handleToggleWakelock(e.target.checked)}
                      className="w-5 h-5 accent-indigo-600 rounded cursor-pointer shrink-0"
                    />
                  </div>
                </div>

                {/* Advanced: hands-free only here + quiz gear when enabled */}
                <div className="bg-theme-glass border border-amber-200/40 rounded-3xl p-6 shadow-xl space-y-4">
                  <h2 className="text-lg font-bold text-theme-text">{t('advancedTitle')}</h2>
                  <p className="text-xs text-theme-muted">{t('advancedHint')}</p>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-theme-bg/60 border border-theme-border">
                    <div>
                      <h4 className="font-bold text-sm text-theme-text">{t('handsFreeEnable')}</h4>
                      <p className="text-xs text-theme-muted mt-0.5">
                        Unlocks nose/hand controls during a quiz.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isExperimentalEnabled}
                      onChange={(e) => setExperimental(e.target.checked)}
                      className="w-5 h-5 accent-indigo-600 rounded cursor-pointer shrink-0"
                    />
                  </div>
                  {isExperimentalEnabled && (
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-theme-bg/60 border border-theme-border opacity-90">
                      <div>
                        <h4 className="font-bold text-sm text-theme-text">{t('handsFreeHand')}</h4>
                        <p className="text-xs text-theme-muted mt-0.5">Remember preference for hand mode.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={gestureEnabled}
                        onChange={(e) => {
                          setHandTrackingEnabled(e.target.checked);
                          saveHandTrackingEnabled(e.target.checked);
                        }}
                        className="w-5 h-5 accent-indigo-600 rounded cursor-pointer shrink-0"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── TAB 5: NOTIFIKASI & PENGINGAT ── */}
            {activeTab === 'notifications' && (
              <motion.div
                key="notifications"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="bg-theme-glass border border-theme-border rounded-3xl p-6 shadow-xl space-y-6">
                  <h2 className="text-lg font-bold text-theme-text flex items-center gap-2">
                    <Bell className="text-indigo-500" size={20} />
                    Reminders
                  </h2>

                  {/* Browser Permission Card */}
                  <div className="p-4 rounded-2xl bg-theme-bg/60 border border-theme-border space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-theme-text">Browser notification permission</h4>
                        <p className="text-xs text-theme-muted mt-0.5">
                          {t('permStatus')}: <strong className="capitalize text-indigo-400">{notifPermission}</strong>
                        </p>
                      </div>
                      <button
                        onClick={handleRequestNotif}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
                      >
                        Allow notifications
                      </button>
                    </div>
                  </div>

                  {/* Daily Reminder Time Picker */}
                  <div className="p-4 rounded-2xl bg-theme-bg/60 border border-theme-border space-y-3">
                    <h4 className="font-bold text-sm text-theme-text">{t('dailyReminder')}</h4>
                    <p className="text-xs text-theme-muted">
                      Noodl can send a gentle study reminder at this time.
                    </p>
                    <div className="flex items-center gap-3 pt-2">
                      <input
                        type="time"
                        value={reminderTime}
                        onChange={(e) => setReminderTime(e.target.value)}
                        className="px-4 py-2.5 bg-theme-bg border border-theme-border rounded-xl text-sm font-mono text-theme-text focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        onClick={handleSaveReminder}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm"
                      >
                        {t('saveReminderTime')}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};
