/**
 * Lightweight UI locale (EN / ID). Not a full i18n framework — just chrome copy.
 * Quiz content language still follows user materials (AI multilingual).
 */
export type Locale = 'en' | 'id';

const STORAGE_KEY = 'noodl_locale';
const ONBOARD_KEY = 'noodl_onboarding_v1';

const dict = {
  en: {
    appName: 'Noodl',
    tagline: 'Use your noodle',
    navHome: 'Home',
    navMix: 'Mix',
    navSync: 'Sync',
    navFiles: 'Files',
    navSettings: 'Settings',
    hubTitle: 'Quick jump',
    hubDesc: 'Jump to any Noodl module',
    settingsTitle: 'Settings',
    apiKeyLabel: 'API key',
    apiKeyHint: 'Paste the key for the provider you selected above. Stored only on this device.',
    apiKeyPlaceholder: 'Paste API key…',
    apiKeyRequired: '(required)',
    apiKeyOptional: '(optional)',
    language: 'App language',
    languageHint: 'UI labels only. Quiz language still matches your notes.',
    emptyHistory: 'No quizzes yet',
    emptyHistoryCta: 'Generate one from Home',
    resumeTitle: 'Quiz in progress',
    resumeBody: 'You have an unfinished quiz. Continue where you left off?',
    resumeContinue: 'Continue',
    resumeDiscard: 'Start over',
    onboardingSkip: 'Skip',
    onboardingNext: 'Next',
    onboardingDone: 'Let’s go',
    onboarding1Title: 'Welcome to Noodl',
    onboarding1Body: 'Turn notes into high-yield quizzes. Pick how the app talks to you.',
    onboarding2Title: 'Three steps',
    onboarding2Body: '1) Add a PDF or topic · 2) Generate a quiz · 3) Review with spaced repetition so it sticks.',
    onboarding3Title: 'One tip',
    onboarding3Body: 'Add an AI provider key in Settings before generating. Hands-free camera modes stay optional and off by default.',
    needKeyTitle: 'AI key needed',
    needKeyBody: 'Add an API key for your chosen provider in Settings. Without it, Noodl can’t generate quizzes.',
    openSettings: 'Open Settings',
    cloudSync: 'Cross-device sync',
    protectedBy: 'Protected by Cloudflare Turnstile',
  },
  id: {
    appName: 'Noodl',
    tagline: 'Pakai otakmu',
    navHome: 'Beranda',
    navMix: 'Campur',
    navSync: 'Ulang',
    navFiles: 'File',
    navSettings: 'Setelan',
    hubTitle: 'Lompat cepat',
    hubDesc: 'Akses modul Noodl',
    settingsTitle: 'Setelan',
    apiKeyLabel: 'API key',
    apiKeyHint: 'Tempel key untuk provider yang dipilih. Hanya disimpan di perangkat ini.',
    apiKeyPlaceholder: 'Tempel API key…',
    apiKeyRequired: '(wajib)',
    apiKeyOptional: '(opsional)',
    language: 'Bahasa aplikasi',
    languageHint: 'Hanya label UI. Bahasa soal mengikuti materi kamu.',
    emptyHistory: 'Belum ada kuis',
    emptyHistoryCta: 'Buat dari Beranda',
    resumeTitle: 'Kuis belum selesai',
    resumeBody: 'Ada sesi kuis yang belum selesai. Lanjutkan?',
    resumeContinue: 'Lanjut',
    resumeDiscard: 'Mulai ulang',
    onboardingSkip: 'Lewati',
    onboardingNext: 'Lanjut',
    onboardingDone: 'Mulai',
    onboarding1Title: 'Selamat datang di Noodl',
    onboarding1Body: 'Ubah catatan jadi kuis high-yield. Pilih bahasa tampilan aplikasi.',
    onboarding2Title: 'Tiga langkah',
    onboarding2Body: '1) Unggah PDF/topik · 2) Generate kuis · 3) Review berkala biar hafal.',
    onboarding3Title: 'Satu tips',
    onboarding3Body: 'Isi API key provider di Setelan sebelum generate. Mode kamera hands-free opsional dan default mati.',
    needKeyTitle: 'Butuh API key',
    needKeyBody: 'Tambah API key provider di Setelan. Tanpa itu Noodl tidak bisa membuat kuis.',
    openSettings: 'Buka Setelan',
    cloudSync: 'Sinkron antar perangkat',
    protectedBy: 'Dilindungi Cloudflare Turnstile',
  },
} as const;

export type MessageKey = keyof typeof dict.en;

export function getLocale(): Locale {
  if (typeof localStorage === 'undefined') return 'en';
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'id' || raw === 'en') return raw;
  // first visit: browser hint
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('id') ? 'id' : 'en';
}

export function setLocale(locale: Locale) {
  localStorage.setItem(STORAGE_KEY, locale);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  window.dispatchEvent(new CustomEvent('noodl:locale', { detail: locale }));
}

export function t(key: MessageKey, locale?: Locale): string {
  const loc = locale || getLocale();
  return dict[loc][key] || dict.en[key] || key;
}

export function isOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARD_KEY) === '1';
}

export function setOnboardingDone() {
  localStorage.setItem(ONBOARD_KEY, '1');
}

export function subscribeLocale(cb: (locale: Locale) => void) {
  const handler = () => cb(getLocale());
  window.addEventListener('noodl:locale', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('noodl:locale', handler);
    window.removeEventListener('storage', handler);
  };
}
