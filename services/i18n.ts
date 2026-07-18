/**
 * Lightweight UI locale (EN / ID). Chrome copy only.
 * Quiz content language follows user materials (AI).
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
    tabProviders: 'AI providers',
    tabAccount: 'Account',
    tabAppearance: 'Appearance',
    tabFeatures: 'Features',
    tabNotifications: 'Notifications',
    apiKeyLabel: 'API key',
    apiKeyHint: 'Paste the key for the provider you selected. Stored only on this device.',
    apiKeyPlaceholder: 'Paste API key…',
    apiKeyRequired: '(required)',
    apiKeyOptional: '(optional)',
    apiKeySaved: 'Saved on this device',
    getKey: 'Get key',
    show: 'Show',
    hide: 'Hide',
    language: 'App language',
    languageHint: 'UI labels only. Quiz language still matches your notes.',
    themeTitle: 'Theme',
    themeHint: 'Pick a look that feels calm for long study sessions.',
    advancedTitle: 'Advanced',
    advancedHint: 'Hands-free camera input (optional). Off by default — uses more battery.',
    handsFreeEnable: 'Enable hands-free lab',
    handsFreeNose: 'Nose pointer',
    handsFreeHand: 'Hand gestures',
    emptyHistory: 'No quizzes yet',
    emptyHistoryCta: 'Generate one from Home',
    emptyHistoryDesc: 'Create a quiz from a PDF or topic and it will show up here.',
    emptyMix: 'Nothing to mix yet',
    emptyMixDesc: 'Generate a few quizzes first, then blend them into one run.',
    emptyMixCta: 'Go to Home',
    emptySrs: 'No reviews due',
    emptySrsDesc: 'Finish a quiz and miss a few cards — they land here for spaced review.',
    emptySrsCta: 'Back to Home',
    emptyBowl: 'Bowl empty',
    mixTitle: 'Mix Room',
    mixSubtitle: 'Blend saved quizzes into one exam run.',
    selectedQuizzes: 'Selected quizzes',
    resumeTitle: 'Quiz in progress',
    resumeBody: 'You have an unfinished quiz. Continue where you left off?',
    resumeContinue: 'Continue',
    resumeDiscard: 'Start over',
    exitQuizTitle: 'Leave quiz?',
    exitQuizBody: 'Progress is auto-saved. You can continue later.',
    exitStay: 'Keep going',
    exitLeave: 'Leave',
    onboardingSkip: 'Skip',
    onboardingNext: 'Next',
    onboardingDone: "Let's go",
    onboarding1Title: 'Welcome to Noodl',
    onboarding1Body: 'Turn notes into high-yield quizzes. Pick how the app talks to you.',
    onboarding2Title: 'Three steps',
    onboarding2Body: '1) Add a PDF or topic · 2) Generate a quiz · 3) Review with spaced repetition so it sticks.',
    onboarding3Title: 'One tip',
    onboarding3Body: 'Add an AI provider key in Settings before generating. Hands-free camera modes stay under Advanced and off by default.',
    needKeyTitle: 'AI key needed',
    needKeyBody: 'Add an API key for your chosen provider in Settings. Without it, Noodl can’t generate quizzes.',
    openSettings: 'Open Settings',
    cloudSync: 'Cross-device sync',
    protectedBy: 'Protected by Cloudflare Turnstile',
    srsTitle: 'Neuro-Sync',
    srsClearConfirm: 'Delete ALL spaced-repetition memory? This cannot be undone.',
    srsCleared: 'Neuro-Sync data cleared.',
    srsClearFail: 'Could not clear data. Try again.',
    startReview: 'Start review',
    dueCards: 'Due now',
    totalCards: 'Total cards',
    learnedCards: 'Learned',
    featuresSrs: 'Spaced repetition',
    featuresWakelock: 'Keep screen awake',
    featuresDynamicIsland: 'Status island',
    save: 'Save',
    cancel: 'Cancel',
    loading: 'Loading…',
    errorGeneric: 'Something went wrong',
    confirmHuman: 'Complete the human check to continue',
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
    tabProviders: 'Provider AI',
    tabAccount: 'Akun',
    tabAppearance: 'Tampilan',
    tabFeatures: 'Fitur',
    tabNotifications: 'Notifikasi',
    apiKeyLabel: 'API key',
    apiKeyHint: 'Tempel key untuk provider yang dipilih. Hanya di perangkat ini.',
    apiKeyPlaceholder: 'Tempel API key…',
    apiKeyRequired: '(wajib)',
    apiKeyOptional: '(opsional)',
    apiKeySaved: 'Tersimpan di perangkat ini',
    getKey: 'Ambil key',
    show: 'Tampil',
    hide: 'Sembunyi',
    language: 'Bahasa aplikasi',
    languageHint: 'Hanya label UI. Bahasa soal mengikuti materi kamu.',
    themeTitle: 'Tema',
    themeHint: 'Pilih tampilan yang nyaman untuk belajar lama.',
    advancedTitle: 'Lanjutan',
    advancedHint: 'Input kamera hands-free (opsional). Default mati — boros baterai.',
    handsFreeEnable: 'Aktifkan lab hands-free',
    handsFreeNose: 'Pointer hidung',
    handsFreeHand: 'Gestur tangan',
    emptyHistory: 'Belum ada kuis',
    emptyHistoryCta: 'Buat dari Beranda',
    emptyHistoryDesc: 'Buat kuis dari PDF/topik — nanti muncul di sini.',
    emptyMix: 'Belum ada yang dicampur',
    emptyMixDesc: 'Generate beberapa kuis dulu, lalu campur jadi satu ujian.',
    emptyMixCta: 'Ke Beranda',
    emptySrs: 'Tidak ada review',
    emptySrsDesc: 'Selesaikan kuis dan salah beberapa soal — masuk antrean review.',
    emptySrsCta: 'Ke Beranda',
    emptyBowl: 'Mangkuk kosong',
    mixTitle: 'Mix Room',
    mixSubtitle: 'Campur kuis tersimpan jadi satu sesi ujian.',
    selectedQuizzes: 'Kuis dipilih',
    resumeTitle: 'Kuis belum selesai',
    resumeBody: 'Ada sesi yang belum selesai. Lanjutkan?',
    resumeContinue: 'Lanjut',
    resumeDiscard: 'Mulai ulang',
    exitQuizTitle: 'Keluar dari kuis?',
    exitQuizBody: 'Progress tersimpan otomatis. Bisa dilanjut nanti.',
    exitStay: 'Tetap di sini',
    exitLeave: 'Keluar',
    onboardingSkip: 'Lewati',
    onboardingNext: 'Lanjut',
    onboardingDone: 'Mulai',
    onboarding1Title: 'Selamat datang di Noodl',
    onboarding1Body: 'Ubah catatan jadi kuis high-yield. Pilih bahasa tampilan.',
    onboarding2Title: 'Tiga langkah',
    onboarding2Body: '1) Unggah PDF/topik · 2) Generate kuis · 3) Review berkala biar hafal.',
    onboarding3Title: 'Satu tips',
    onboarding3Body: 'Isi API key di Setelan sebelum generate. Hands-free ada di Lanjutan, default mati.',
    needKeyTitle: 'Butuh API key',
    needKeyBody: 'Tambah API key provider di Setelan. Tanpa itu Noodl tidak bisa membuat kuis.',
    openSettings: 'Buka Setelan',
    cloudSync: 'Sinkron antar perangkat',
    protectedBy: 'Dilindungi Cloudflare Turnstile',
    srsTitle: 'Neuro-Sync',
    srsClearConfirm: 'Hapus SEMUA memori review berkala? Tidak bisa dibatalkan.',
    srsCleared: 'Data Neuro-Sync dihapus.',
    srsClearFail: 'Gagal menghapus. Coba lagi.',
    startReview: 'Mulai review',
    dueCards: 'Jatuh tempo',
    totalCards: 'Total kartu',
    learnedCards: 'Sudah kuat',
    featuresSrs: 'Spaced repetition',
    featuresWakelock: 'Layar tetap nyala',
    featuresDynamicIsland: 'Status island',
    save: 'Simpan',
    cancel: 'Batal',
    loading: 'Memuat…',
    errorGeneric: 'Terjadi kesalahan',
    confirmHuman: 'Selesaikan cek manusia dulu',
  },
} as const;

export type MessageKey = keyof typeof dict.en;

export function getLocale(): Locale {
  if (typeof localStorage === 'undefined') return 'en';
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'id' || raw === 'en') return raw;
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('id') ? 'id' : 'en';
}

export function setLocale(locale: Locale) {
  localStorage.setItem(STORAGE_KEY, locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
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
