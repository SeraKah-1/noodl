import { getLocale } from './i18n';

/**
 * ==========================================
 * KAOMOJI NOTIFICATION SERVICE (V2 - KAOMOJI.RU EDITION)
 * ==========================================
 * Layanan notifikasi yang lebih "manusiawi", lucu, dan ekspresif.
 */

const KAOMOJI = {
    HAPPY: ["( ◕ ‿ ◕ )", "(｡•̀ᴗ-)✧", "( b ᵔ ▽ ᵔ )b", "ヽ(・∀・)ﾉ"],
    CELEBRATE: ["(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧", "ヽ(⌐■_■)ノ♪♬", "°˖✧◝(⁰▿⁰)◜✧˖°", "＼(≧▽≦)／"],
    CONFUSED: ["( @ _ @ )", "(・_・;)", "┐( ˘_˘ )┌", "(O_O;)"],
    DETERMINED: ["( ง •̀ _ •́ )ง", "ᕙ(  •̀ ᗜ •́  )ᕗ", "(wu_wu)", "୧( ⁼̴̶̤̀ω⁼̴̶̤́ )૭"],
    SLEEPY: ["( ￣ o ￣ ) zzZ", "(－_－) zzZ", "(ρ_・).。", "(o´Д`o)ﾉ"],
    SHOCKED: ["( ⊙ _ ⊙ )", "Σ(O_O)", "(;;;*_*)", "щ(゜ロ゜щ)"],
    LOVE: ["( ♥ ◡ ♥ )", "( ˘ ³˘)♥", "(´ε｀ )♡", "(Zn_n)"],
    STUDY: ["( 📝 _ 📝 )", "(o_ _)o ⌨", "φ(．．;)", "( .. )φ"],
    ANGRY: ["( ≧Д≦)", "(fz_z)", "(╬ Ò﹏Ó)", "(ノ°Д°）ノ︵ ┻━┻"]
};

const getRandomKaomoji = (category: keyof typeof KAOMOJI) => {
    const list = KAOMOJI[category];
    return list[Math.floor(Math.random() * list.length)];
};
  
export const requestKaomojiPermission = async (): Promise<boolean> => {
    if (!("Notification" in window)) return false;
    
    try {
        if (Notification.permission === "granted") return true;
        if (Notification.permission !== "denied") {
            const permission = await Notification.requestPermission();
            return permission === "granted";
        }
    } catch (e) {
        console.warn("Notification permission error:", e);
        return false;
    }
    return false;
};

const sendKaomojiNotify = (title: string, body: string, tag?: string) => {
    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
        try {
            // Try ServiceWorker first (Mobile Support)
            if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification(title, {
                        body: body,
                        icon: "https://cdn-icons-png.flaticon.com/512/3767/3767084.png",
                        tag: tag,
                        vibrate: [200, 100, 200]
                    } as any);
                }).catch(() => fallbackNotify(title, body, tag));
            } else {
                fallbackNotify(title, body, tag);
            }
        } catch (e) {
            console.warn("Notification failed:", e);
        }
    }
};

const fallbackNotify = (title: string, body: string, tag?: string) => {
    try {
        new Notification(title, {
            body: body,
            icon: "https://cdn-icons-png.flaticon.com/512/3767/3767084.png", 
            tag: tag
        });
    } catch (e) {
        console.warn("Notification constructor failed.");
    }
}

// --- SPECIFIC TRIGGERS ---

export const notifyQuizReady = (questionCount: number) => {
    const id = getLocale() === 'id';
    sendKaomojiNotify(
        id
          ? `${getRandomKaomoji('CELEBRATE')} Kuis siap!`
          : `${getRandomKaomoji('CELEBRATE')} Quiz ready!`,
        id
          ? `${questionCount} soal baru keluar dari oven AI. Gas sekarang!`
          : `${questionCount} fresh questions just left the AI oven. Dive in!`,
        'quiz-ready'
    );
};

export const notifySupabaseSuccess = () => {
    const id = getLocale() === 'id';
    sendKaomojiNotify(
        id
          ? `${getRandomKaomoji('LOVE')} Awan terhubung!`
          : `${getRandomKaomoji('LOVE')} Cloud connected!`,
        id
          ? `Supabase connect. Data kamu aman lintas perangkat.`
          : `Supabase is connected. Your data is safe across devices.`,
        'supabase-connect'
    );
};

export const notifySupabaseError = () => {
    const id = getLocale() === 'id';
    sendKaomojiNotify(
        id
          ? `${getRandomKaomoji('ANGRY')} Koneksi putus…`
          : `${getRandomKaomoji('ANGRY')} Connection failed…`,
        id
          ? `Kunci Supabase salah atau server lagi rewel. Cek setelan.`
          : `Supabase key looks wrong or the server is grumpy. Check Settings.`,
        'supabase-error'
    );
};

export const notifyReviewDue = (count: number) => {
    const id = getLocale() === 'id';
    sendKaomojiNotify(
        id
          ? `${getRandomKaomoji('DETERMINED')} Waktunya review!`
          : `${getRandomKaomoji('DETERMINED')} Review time!`,
        id
          ? `Ada ${count} kartu yang mulai pudar. Review 5 menit biar nempel.`
          : `${count} cards are getting fuzzy. 5 minutes of review locks them in.`,
        'srs-due'
    );
};

export const notifyStudyReminder = () => {
    const id = getLocale() === 'id';
    sendKaomojiNotify(
        id
          ? `${getRandomKaomoji('STUDY')} Alarm belajar!`
          : `${getRandomKaomoji('STUDY')} Study ping!`,
        id
          ? `Yuk login sebentar — satu kuis biar streak tetap hidup!`
          : `Pop in for one quiz and keep that streak alive!`,
        'daily-reminder'
    );
};

// Start an idle reminder that sends a notification if the app is put in background
export const setupIdleReminders = () => {
    if (typeof window === 'undefined') return;
    
    let idleTimer: any;
    
    const resetTimer = () => {
        clearTimeout(idleTimer);
        // Set reminder for 4 hours of inactivity
        idleTimer = setTimeout(() => {
            notifyStudyReminder();
            resetTimer();
        }, 1000 * 60 * 60 * 4);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keypress', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    
    resetTimer(); // Init
};
