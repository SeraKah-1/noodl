/**
 * Single place for UI locale → model language instructions.
 * Quiz/simulations/chat/notifications follow the app language the user chose.
 */
import { getLocale, type Locale } from './i18n';

export function languageDisplayName(locale?: Locale): string {
  const loc = locale || getLocale();
  return loc === 'id' ? 'Indonesian (Bahasa Indonesia)' : 'English';
}

/** Short block injected into every generative system prompt */
export function outputLanguageRule(locale?: Locale): string {
  const name = languageDisplayName(locale);
  return [
    `OUTPUT LANGUAGE (MANDATORY):`,
    `- Write ALL learner-facing text in ${name}.`,
    `- That includes questions, options, explanations, hints, labels, UI strings inside generated HTML, summaries, chat replies, and notifications.`,
    `- Keep standard technical terms / formulas as commonly written; surrounding prose stays in ${name}.`,
    `- Do not switch languages unless the user message explicitly asks to.`,
  ].join('\n');
}

/** For short system lines */
export function outputLanguageOneLiner(locale?: Locale): string {
  return `Respond entirely in ${languageDisplayName(locale)}.`;
}
