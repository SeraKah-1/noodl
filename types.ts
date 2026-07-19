
export type { ThemeName } from './services/themeService';

export enum QuizState {
  CONFIG = 'CONFIG',
  PROCESSING = 'PROCESSING',
  QUIZ_ACTIVE = 'QUIZ_ACTIVE',
  RESULTS = 'RESULTS',
  ERROR = 'ERROR',
  FLASHCARDS = 'FLASHCARDS'
}

export enum AppView {
  GENERATOR = 'GENERATOR',
  WORKSPACE = 'WORKSPACE', 
  NEURO_SYNC = 'NEURO_SYNC',
  VIRTUAL_ROOM = 'VIRTUAL_ROOM',
  CHAT = 'CHAT',
  VISUALIZATION = 'VISUALIZATION',
  MATERIAL_OVERVIEW = 'MATERIAL_OVERVIEW',
  SETTINGS = 'SETTINGS'
}

export enum QuizMode {
  STANDARD = 'STANDARD',
  SCAFFOLDING = 'SCAFFOLDING', 
  SURVIVAL = 'SURVIVAL',
  TIME_RUSH = 'TIME_RUSH', // New Mode
}

// Updated to Bloom's Taxonomy
export enum ExamStyle {
  C1_RECALL = 'C1_RECALL',         // Mengingat (Hafalan)
  C2_CONCEPT = 'C2_CONCEPT',       // Memahami (Konsep Dasar)
  C3_APPLICATION = 'C3_APPLICATION', // Menerapkan (Studi Kasus)
  C4_ANALYSIS = 'C4_ANALYSIS',     // Menganalisis (Diagnosa/Logika)
  C5_EVALUATION = 'C5_EVALUATION'  // Mengevaluasi (Kritik/Bandingkan)
}

// --- NEW QUESTION TYPES ---
export type QuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK';

export type ConceptPriority = 'HIGH' | 'MODERATE' | 'FILLER';

export interface ConceptNode {
  concept: string;
  priority: ConceptPriority;
  reason: string;
}

export interface Question {
  id: string | number;
  type?: QuestionType; // Defaults to MULTIPLE_CHOICE
  text: string;
  options: string[]; 
  correctIndex: number; 
  correctAnswer?: string; // For FillBlank (String matching)
  proposedAnswer?: string; // NEW: For True/False (e.g. "Apakah ibukota Jabar adalah [Surabaya]?")
  explanation: string;
  hint?: string; // NEW: Socratic hint
  keyPoint: string; 
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isReview?: boolean;
  originalId?: string | number;
  // Phase 1: High-Yield Pipeline tracking
  conceptName?: string;
  conceptPriority?: ConceptPriority;
}

export interface SRSItem {
  id?: string;
  keycard_id?: string;
  item_id: string;
  item_type: 'quiz_question' | 'note' | 'library';
  content: any; // The actual question object or note content
  easiness: number;
  interval: number;
  repetition: number;
  next_review: string; // ISO string
  created_at?: string;
  updated_at?: string;
  client_updated_at?: string;
  deleted_at?: string | null;
}

export interface QuizResult {
  correctCount: number;
  totalQuestions: number;
  score: number;
  mode: QuizMode;
  answers: { questionId: string | number; selectedIndex: number; textAnswer?: string; isCorrect: boolean }[];
}


export interface SkillAnalysis {
  memory: number; 
  logic: number;
  focus: number;
  application: number;
  analysis: string; 
}

export interface LibraryItem {
  id: string | number;
  title: string;
  content: string; 
  processedContent?: string; // NEW: Cached summary/notes from AI
  type: 'pdf' | 'text' | 'note' | 'image' | 'presentation';
  tags: string[];
  created_at: string;
  updated_at?: string;
  client_updated_at?: string;
  deleted_at?: string | null;
}

export interface CloudNote {
  id: string | number; 
  title: string;       
  content: string;
  created_at: string;  
  tags?: string[];     
}

export type AiProvider = 'gemini' | 'openai' | 'openrouter' | 'anthropic' | 'groq' | 'ninerouter' | 'custom';

export type StorageProvider = 'local' | 'supabase';

export interface KeycardData {
  version: string;
  id?: string;
  metadata: {
    owner: string;
    created_at: number;
    expires_at?: number;
    valid_domain?: string;
  };
  config: {
    geminiKey?: string; 
    geminiKeys?: string[]; 
    preferredProvider?: AiProvider;
    customPrompt?: string; 
  };
}

export interface DeepInsightData {
  summary: {
    overallAssessment: string;
    strongAreas: string[];
    weakAreas: string[];
    studyPlan: string;
    motivationalQuote: string;
  };
  topics: Record<string, ConceptCardData>;
}

export interface ConceptCardData {
  topic: string;
  priority: string;
  accuracy: number | null;
  summary: string;
  insights: Array<{
    point: string;
    evidence?: string;
    formula?: string;
  }>;
  traps: Array<{
    trap: string;
    correction: string;
  }>;
  mnemonic: string;
  connections: string[];
}

export interface ModelConfig {
  provider: AiProvider;
  modelId: string;
  questionCount: number;
  mode: QuizMode;
  examStyle: ExamStyle[]; // CHANGED: Now an array for multi-select
  bloomPercentages?: Record<string, number>; // New: Manual distribution of bloom levels
  topic?: string; 
  customPrompt?: string; 
  libraryContext?: string;
  enableRetention?: boolean;
  enableMixedTypes?: boolean; // New: Toggle for True/False & FillBlank
  stickyMode?: boolean; // New: Allow repetitive questions
  folder?: string;
  conceptMap?: ConceptNode[]; // Phase 1: Cached concept map
  styleNuance?: string; // Phase 2: Extracted style from past exams
  pastExamContext?: string; // Phase 2: Raw past exam questions for nuance extraction
}

export interface ModelOption {
  id: string;
  label: string;
  provider: AiProvider;
  isVision?: boolean; 
}

// ═══ VISUALIZATION SYSTEM ═══

export type VisualizationType =
  | 'SIMULATION'     // Physics/math interactive sim (sliders, canvas)
  | 'DIAGRAM'        // Labeled diagrams (anatomy, circuits, architecture)
  | 'CHART'          // Data visualization (bar, line, pie, scatter)
  | 'PROCESS_FLOW'   // Step-by-step animated processes (cell division, algorithms)
  | '3D_MODEL';      // 3D rotatable models (molecules, organs, geometry)

export interface VisualizationBlueprint {
  id: string;
  concept: string;
  vizType: VisualizationType;
  description: string;
  variables: string[];
  priority: 'HIGH' | 'MODERATE' | 'LOW';
  rationale: string;
}

export interface VisualizationResult {
  id: string;
  blueprint: VisualizationBlueprint;
  htmlCode: string;
  explanation: string;
  interactionGuide: string;
  status: 'success' | 'error' | 'generating';
  error?: string;
}
