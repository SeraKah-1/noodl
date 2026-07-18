/**
 * Single place for generative output language.
 * Priority: explicit locale → detect from material text → app UI locale.
 * (English materials must not produce Indonesian quizzes/sims when clearly EN.)
 */
import { getLocale, type Locale } from './i18n';

const ID_MARKERS = [
  ' yang ', ' dan ', ' untuk ', ' dengan ', ' adalah ', ' tidak ', ' pada ',
  ' dari ', ' dalam ', ' akan ', ' atau ', ' sebagai ', ' juga ', ' ini ',
  ' itu ', ' karena ', ' jika ', ' maka ', ' dapat ', ' harus ', ' tentang ',
  ' antara ', ' setelah ', ' sebelum ', ' melalui ', ' yaitu ', ' berupa ',
];
const EN_MARKERS = [
  ' the ', ' and ', ' for ', ' with ', ' that ', ' this ', ' from ', ' have ',
  ' which ', ' their ', ' about ', ' into ', ' would ', ' could ', ' should ',
  ' there ', ' these ', ' those ', ' where ', ' when ', ' what ', ' because ',
  ' between ', ' through ', ' without ', ' using ', ' based ', ' example ',
];

/** Lightweight material-language detector (no external libs). */
export function detectLocaleFromText(text?: string | null): Locale | null {
  if (!text || text.trim().length < 50) return null;
  const sample = ` ${text.slice(0, 6000).toLowerCase().replace(/[^\p{L}\s]/gu, ' ')} `;
  let idScore = 0;
  let enScore = 0;
  for (const w of ID_MARKERS) if (sample.includes(w)) idScore += 1;
  for (const w of EN_MARKERS) if (sample.includes(w)) enScore += 1;
  // Need a clear majority so mixed glossaries don't flip randomly
  if (enScore >= 4 && enScore >= idScore * 1.35) return 'en';
  if (idScore >= 4 && idScore >= enScore * 1.35) return 'id';
  return null;
}

/**
 * Locale for AI learner-facing content.
 * Material language wins when detection is confident; else app UI locale.
 */
export function resolveOutputLocale(materialSample?: string | null, explicit?: Locale): Locale {
  if (explicit === 'en' || explicit === 'id') return explicit;
  const detected = detectLocaleFromText(materialSample || undefined);
  if (detected) return detected;
  return getLocale();
}

export function languageDisplayName(locale?: Locale): string {
  const loc = locale || getLocale();
  return loc === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English';
}

/** Short block injected into every generative system prompt */
export function outputLanguageRule(
  localeOrMaterial?: Locale | string | null,
  materialSample?: string | null
): string {
  let locale: Locale;
  if (localeOrMaterial === 'en' || localeOrMaterial === 'id') {
    locale = resolveOutputLocale(materialSample, localeOrMaterial);
  } else if (typeof localeOrMaterial === 'string' && localeOrMaterial.length > 0) {
    // First arg used as material sample
    locale = resolveOutputLocale(localeOrMaterial);
  } else {
    locale = resolveOutputLocale(materialSample);
  }
  const name = languageDisplayName(locale);
  return [
    `OUTPUT LANGUAGE (MANDATORY — HIGHEST PRIORITY):`,
    `- Write ALL learner-facing text in ${name} ONLY.`,
    `- That includes: questions, options, explanations, hints, summaries, insights, traps, labels, tooltips, HTML UI chrome, graph node/edge labels, simulation controls, chat replies.`,
    `- Do NOT use Indonesian if the required language is English (and vice versa).`,
    `- Ignore any Indonesian or English wording that appears only as examples inside system/developer instructions if it conflicts with this rule.`,
    `- Keep standard technical terms / formulas as commonly written; surrounding prose stays in ${name}.`,
    `- Do not switch languages unless the user message explicitly asks to.`,
  ].join('\n');
}

/** For short system lines */
export function outputLanguageOneLiner(locale?: Locale, materialSample?: string | null): string {
  const loc = locale || resolveOutputLocale(materialSample);
  return `Respond entirely in ${languageDisplayName(loc)}. Never mix languages.`;
}
