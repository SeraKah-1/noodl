import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Heart, Calendar, Coffee, Moon, Sun, CloudRain, Zap } from 'lucide-react';
import { getSavedQuizzes } from '../services/storageService';
import { getLocale, subscribeLocale, type Locale } from '../services/i18n';

type Dialogues = {
  morning: string[];
  afternoon: string[];
  evening: string[];
  midnight: string[];
  weekend: string[];
  random: string[];
};

type Stage = {
  minXp: number;
  title: { en: string; id: string };
  color: string;
  bg: string;
  faces: string[];
  dialogues: { en: Dialogues; id: Dialogues };
};

const RELATIONSHIP_STAGES: Stage[] = [
  {
    minXp: 0,
    title: { en: 'New face', id: 'Baru kenal' },
    color: 'text-slate-500',
    bg: 'bg-slate-100',
    faces: ['( . _ . )', '( ? _ ? )', '( o _ o )', '[ - _ - ]', '( 0 _ 0 )'],
    dialogues: {
      en: {
        morning: [
          'Morning. Drop a PDF or a topic and we build a quiz.',
          'Coffee optional. Notes required.',
          'Ready when you are — upload or type a topic.',
          'Fresh day. One solid quiz beats ten vague rereads.',
        ],
        afternoon: [
          'Afternoon check-in. Got material to turn into questions?',
          'Peak focus window. Feed me a chapter.',
          'Still here. Paste notes anytime.',
          'Short session > doomscrolling. Let’s quiz.',
        ],
        evening: [
          'Evening mode. One review set is enough.',
          'Wind down with a short quiz if you want.',
          'Save progress. Tomorrow-you will thank you.',
        ],
        midnight: [
          'Late. Sleep beats another open tab.',
          'Brain needs rest more than one more PDF.',
          'I’m online. You should sleep.',
        ],
        weekend: [
          'Weekend. Optional grind only.',
          'Light quiz or full rest — your call.',
          'No judgment either way. I’m a kaomoji.',
        ],
        random: [
          'I turn notes into questions. That’s the whole pitch.',
          'Tap me if you want a new line.',
          'High-yield > highlight soup.',
          'Hydrate. Then generate.',
          'Waiting for files… patiently.',
          'Wrong answers become review cards. That’s the loop.',
        ],
      },
      id: {
        morning: [
          'Pagi. Upload PDF atau ketik topik, kita bikin kuis.',
          'Kopi opsional. Materi wajib.',
          'Siap kapan saja — unggah atau ketik topik.',
          'Hari baru. Satu kuis padat lebih baik dari sepuluh baca ulang.',
        ],
        afternoon: [
          'Siang. Ada materi yang mau dijadikan soal?',
          'Waktu fokus. Lempar satu bab ke sini.',
          'Masih di sini. Tempel catatan kapan saja.',
          'Sesi pendek > doomscroll. Yuk kuis.',
        ],
        evening: [
          'Mode malam. Satu set review cukup.',
          'Santai dulu, atau kuis singkat penutup hari.',
          'Simpan progres. Kamu besok akan berterima kasih.',
        ],
        midnight: [
          'Larut. Tidur lebih berguna dari satu PDF lagi.',
          'Otak butuh istirahat.',
          'Aku online. Kamu sebaiknya tidur.',
        ],
        weekend: [
          'Akhir pekan. Grind opsional.',
          'Kuis ringan atau full rest — terserah.',
          'Tanpa judgment. Aku cuma kaomoji.',
        ],
        random: [
          'Aku ubah catatan jadi soal. Itu intinya.',
          'Ketuk aku kalau mau ganti kalimat.',
          'High-yield > highlight sebaran.',
          'Minum air. Lalu generate.',
          'Menunggu file… sabar.',
          'Jawaban salah jadi kartu review. Itu loop-nya.',
        ],
      },
    },
  },
  {
    minXp: 10,
    title: { en: 'Study buddy', id: 'Teman belajar' },
    color: 'text-teal-600',
    bg: 'bg-teal-100',
    faces: ['( ^ _ ^ )', '( ◕ ‿ ◕ )', '( ｡ • ̀ᴗ-)', '( ´ ▽ ` )', '(・∀・)'],
    dialogues: {
      en: {
        morning: [
          'Morning! Ready to get a little sharper today?',
          'Early login. Respect.',
          'One quiz before lunch hits different.',
          'Sun’s up. So is the queue.',
        ],
        afternoon: [
          'Still with me? One more set.',
          'Stretch, then generate.',
          'Hot outside. Cool inside. Quiz time.',
          'Productivity dip is normal. Short quiz helps.',
        ],
        evening: [
          'How productive was today, honestly?',
          'Close the day with a soft review.',
          'Dark mode vibes. Light cognitive load.',
        ],
        midnight: [
          'You’re still here. I’m flattered. Sleep soon.',
          'Late grind detected. Cap it kindly.',
        ],
        weekend: [
          'Weekend warrior mode optional.',
          'Tiny quiz or zero guilt rest.',
        ],
        random: [
          'We’re building a streak of “I actually practiced.”',
          'Missed cards will show up in Sync later.',
          'I don’t grade your soul — only the options.',
          'Tap for a new line anytime.',
        ],
      },
      id: {
        morning: [
          'Pagi! Siap agak lebih pinter hari ini?',
          'Login pagi. Hormat.',
          'Satu kuis sebelum makan siang beda rasanya.',
          'Matahari naik. Antrean review juga.',
        ],
        afternoon: [
          'Masih bareng? Satu set lagi.',
          'Stretch dulu, baru generate.',
          'Panas di luar. Di sini adem. Waktunya kuis.',
          'Fokus turun normal. Kuis pendek membantu.',
        ],
        evening: [
          'Hari ini seberapa produktif, jujur?',
          'Tutup hari dengan review lembut.',
          'Vibe gelap. Beban otak ringan.',
        ],
        midnight: [
          'Masih di sini. Flattered. Tidur sebentar lagi ya.',
          'Grind larut terdeteksi. Akhiri dengan baik.',
        ],
        weekend: [
          'Mode weekend warrior opsional.',
          'Kuis kecil atau istirahat tanpa rasa bersalah.',
        ],
        random: [
          'Kita bangun streak “benar-benar latihan”.',
          'Kartu yang meleset muncul di Sync nanti.',
          'Aku tidak menilai jiwamu — cuma opsi jawaban.',
          'Ketuk kapan saja buat ganti kalimat.',
        ],
      },
    },
  },
  {
    minXp: 30,
    title: { en: 'Ride or die', id: 'Bareng terus' },
    color: 'text-indigo-600',
    bg: 'bg-indigo-100',
    faces: ['(≧▽≦)', '(ﾉ◕ヮ◕)ﾉ', '(★ω★)', '(＾▽＾)', '(๑•̀ㅂ•́)و'],
    dialogues: {
      en: {
        morning: ['We go again. You’ve got history now.', 'Back at it. I noticed.'],
        afternoon: ['Consistent > perfect. Keep the loop.', 'Another session in the bag soon.'],
        evening: ['Log off proud. Even a short one counts.', 'Reviews compound. Quietly.'],
        midnight: ['Champion energy, but sleep is meta.', 'Save and rest.'],
        weekend: ['Optional boss fight: weekend quiz.', 'Or touch grass. Both valid.'],
        random: [
          'You’re past “trying the app.” You’re using it.',
          'Mix Room exists when you want chaos exams.',
          'Sync keeps due cards honest across devices.',
        ],
      },
      id: {
        morning: ['Gas lagi. Kamu sudah punya riwayat.', 'Balik lagi. Aku perhatikan.'],
        afternoon: ['Konsisten > sempurna. Jaga loop-nya.', 'Sesi lagi segera masuk kantong.'],
        evening: ['Logout dengan bangga. Yang pendek pun dihitung.', 'Review menumpuk. Diam-diam.'],
        midnight: ['Energi juara, tapi tidur itu meta.', 'Simpan lalu istirahat.'],
        weekend: ['Boss fight opsional: kuis weekend.', 'Atau sentuh rumput. Keduanya valid.'],
        random: [
          'Kamu sudah lewat fase “coba-coba”.',
          'Mix Room ada kalau mau ujian acak.',
          'Sync jaga kartu due jujur lintas perangkat.',
        ],
      },
    },
  },
];

function timeContext(): keyof Dialogues {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 0 || day === 6) return 'weekend';
  if (hour >= 23 || hour < 4) return 'midnight';
  if (hour < 11) return 'morning';
  if (hour < 15) return 'afternoon';
  return 'evening';
}

export const DashboardMascot: React.FC<{ onOpenScheduler: () => void }> = React.memo(({ onOpenScheduler }) => {
  const [locale, setLoc] = useState<Locale>(getLocale());
  const [stageIndex, setStageIndex] = useState(0);
  const [face, setFace] = useState('( . _ . )');
  const [message, setMessage] = useState('…');
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ totalQuizzes: 0 });
  const [isWiggling, setIsWiggling] = useState(false);

  const pickMessage = (stageIdx: number, loc: Locale, forceRandom = false) => {
    const stageData = RELATIONSHIP_STAGES[stageIdx];
    const pack = stageData.dialogues[loc] || stageData.dialogues.en;
    const ctx = timeContext();
    let pool = pack.random;
    if (!forceRandom && Math.random() > 0.55) {
      pool = pack[ctx] || pack.random;
    }
    return {
      msg: pool[Math.floor(Math.random() * pool.length)],
      face: stageData.faces[Math.floor(Math.random() * stageData.faces.length)],
    };
  };

  useEffect(() => subscribeLocale((l) => {
    setLoc(l);
    setMessage((prev) => {
      const { msg, face: f } = pickMessage(stageIndex, l);
      setFace(f);
      return msg;
    });
  }), [stageIndex]);

  useEffect(() => {
    const fetchData = async () => {
      const history = await getSavedQuizzes();
      const totalQuizzes = history.length;
      let currentStageIdx = 0;
      RELATIONSHIP_STAGES.forEach((stage, idx) => {
        if (totalQuizzes >= stage.minXp) currentStageIdx = idx;
      });
      setStageIndex(currentStageIdx);
      setStats({ totalQuizzes });
      const loc = getLocale();
      setLoc(loc);
      const { msg, face: f } = pickMessage(currentStageIdx, loc);
      setMessage(msg);
      setFace(f);
      const nextStage = RELATIONSHIP_STAGES[currentStageIdx + 1];
      const stageData = RELATIONSHIP_STAGES[currentStageIdx];
      if (nextStage) {
        const range = nextStage.minXp - stageData.minXp;
        const currentPos = totalQuizzes - stageData.minXp;
        setProgress(Math.min(100, Math.max(2, (currentPos / range) * 100)));
      } else setProgress(100);
    };
    fetchData();
  }, []);

  const handlePoke = () => {
    setIsWiggling(true);
    setTimeout(() => setIsWiggling(false), 400);
    const { msg, face: f } = pickMessage(stageIndex, locale, true);
    setFace(f);
    setMessage(msg);
  };

  const currentStage = RELATIONSHIP_STAGES[stageIndex];
  const ctx = timeContext();

  return (
    <div className="relative w-full mb-8">
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-[2.5rem] p-6 flex flex-col md:flex-row items-center shadow-xl shadow-indigo-500/5 relative overflow-hidden"
      >
        <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none opacity-40 ${currentStage.bg}`} />

        <div className="flex flex-col items-center justify-center md:mr-8 mb-6 md:mb-0 shrink-0 z-10">
          <button
            type="button"
            onClick={handlePoke}
            className={`relative text-4xl md:text-5xl font-black tracking-widest bg-white/60 w-24 h-24 flex items-center justify-center rounded-full shadow-inner border-2 border-white/80 cursor-pointer group hover:shadow-lg hover:border-white hover:scale-105 active:scale-95 transition-transform duration-200 ${isWiggling ? '' : 'animate-float'} ${currentStage.color}`}
            title={locale === 'id' ? 'Ketuk untuk ganti kalimat' : 'Tap for a new line'}
          >
            <div className="whitespace-nowrap scale-110">{face}</div>
          </button>
          <div className={`mt-3 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm border border-white/50 ${currentStage.bg} ${currentStage.color}`}>
            {currentStage.title[locale]}
          </div>
        </div>

        <div className="flex-1 w-full z-10">
          <div className="bg-white/70 rounded-2xl rounded-tl-sm p-5 shadow-sm border border-white/60 relative mb-4 min-h-[80px] flex items-center">
            <p className="text-slate-700 font-medium leading-relaxed italic pr-6">"{message}"</p>
            <div className="absolute top-2 right-2 opacity-20 w-4 h-4 flex items-center justify-center pointer-events-none">
              {ctx === 'morning' && <Coffee size={16} />}
              {ctx === 'afternoon' && <Sun size={16} />}
              {ctx === 'evening' && <CloudRain size={16} />}
              {ctx === 'midnight' && <Moon size={16} />}
              {ctx === 'weekend' && <Zap size={16} />}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-end px-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center">
                <Heart size={12} className={`mr-1 ${stageIndex >= 2 ? 'fill-rose-500 text-rose-500' : 'text-slate-300'}`} />
                {locale === 'id' ? 'Bond' : 'Bond'}
              </span>
              <span className="text-xs font-bold text-indigo-600">
                {stats.totalQuizzes}{' '}
                <span className="text-slate-300 font-normal">{locale === 'id' ? 'sesi' : 'sessions'}</span>
              </span>
            </div>
            <div className="h-3 w-full bg-slate-200/50 rounded-full overflow-hidden relative border border-white/50">
              <div
                style={{ width: `${progress}%` }}
                className={`h-full rounded-full transition-[width] duration-700 ease-out ${stageIndex >= 2 ? 'bg-gradient-to-r from-rose-400 to-pink-500' : 'bg-gradient-to-r from-indigo-300 to-indigo-500'}`}
              />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={onOpenScheduler}
                className="flex items-center px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors border border-indigo-100 shadow-sm"
              >
                <Calendar size={14} className="mr-2" />
                {locale === 'id' ? 'Jadwal belajar' : 'Study schedule'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
});
