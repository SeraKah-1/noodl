import type { AiProvider, ExamStyle, Question, QuestionType, QuizMode } from '../types.ts';

export interface ValidatedQuizImport {
  questions: Question[];
  provider: AiProvider;
  modelId: string;
  mode: QuizMode;
  examStyle: ExamStyle[];
  title: string;
}

const PROVIDERS: AiProvider[] = ['gemini', 'openai', 'openrouter', 'anthropic', 'groq', 'ninerouter', 'custom'];
const MODES = ['STANDARD', 'SCAFFOLDING', 'SURVIVAL', 'TIME_RUSH'] as QuizMode[];
const EXAM_STYLES = ['C1_RECALL', 'C2_CONCEPT', 'C3_APPLICATION', 'C4_ANALYSIS', 'C5_EVALUATION'] as ExamStyle[];
const QUESTION_TYPES: QuestionType[] = ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'];

const boundedString = (value: unknown, max: number): string => (
  typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : ''
);

export function validateQuizImport(value: unknown): ValidatedQuizImport {
  if (!value || typeof value !== 'object') throw new Error('The JSON root must be an object.');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.questions) || raw.questions.length === 0 || raw.questions.length > 500) {
    throw new Error('The import must contain between 1 and 500 questions.');
  }

  const questions = raw.questions.map((entry, index): Question => {
    if (!entry || typeof entry !== 'object') throw new Error(`Question ${index + 1} is not an object.`);
    const item = entry as Record<string, unknown>;
    const text = boundedString(item.text, 20_000);
    const options = Array.isArray(item.options)
      ? item.options.filter((option): option is string => typeof option === 'string' && option.length <= 10_000)
      : [];
    const type = QUESTION_TYPES.includes(item.type as QuestionType)
      ? item.type as QuestionType
      : 'MULTIPLE_CHOICE';
    const correctIndex = Number(item.correctIndex);
    const validChoice = Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length;
    const correctAnswer = boundedString(item.correctAnswer, 10_000);

    if (!text) throw new Error(`Question ${index + 1} has no valid text.`);
    if (type === 'FILL_BLANK' ? !correctAnswer : options.length < 2 || !validChoice) {
      throw new Error(`Question ${index + 1} has an invalid answer definition.`);
    }

    return {
      id: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : index + 1,
      type,
      text,
      options,
      correctIndex: validChoice ? correctIndex : 0,
      correctAnswer: correctAnswer || undefined,
      proposedAnswer: boundedString(item.proposedAnswer, 10_000) || undefined,
      explanation: boundedString(item.explanation, 30_000),
      hint: boundedString(item.hint, 10_000) || undefined,
      keyPoint: boundedString(item.keyPoint, 1_000) || 'Imported',
      difficulty: ['Easy', 'Medium', 'Hard'].includes(String(item.difficulty))
        ? item.difficulty as Question['difficulty']
        : 'Medium',
    };
  });

  const provider = PROVIDERS.includes(raw.provider as AiProvider) ? raw.provider as AiProvider : 'gemini';
  const mode = MODES.includes(raw.mode as QuizMode) ? raw.mode as QuizMode : 'STANDARD' as QuizMode;
  const examStyle = Array.isArray(raw.examStyle)
    ? raw.examStyle.filter((style): style is ExamStyle => EXAM_STYLES.includes(style as ExamStyle))
    : [];

  return {
    questions,
    provider,
    modelId: boundedString(raw.modelId, 200) || 'imported',
    mode,
    examStyle: examStyle.length ? examStyle : ['C2_CONCEPT' as ExamStyle],
    title: boundedString(raw.fileName, 200) || boundedString(raw.title, 200) || 'Imported Quiz',
  };
}
