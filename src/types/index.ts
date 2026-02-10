// Type definitions for Lexi

export interface Word {
  id: string;
  word: string;
  definition: string;
  language: string;
  dateAdded: number; // timestamp
  tags: string[];
  aiGenerated: boolean;
  examples?: string[];
  groupIds?: string[];
}

export interface Translation {
  id: string;
  sourceWord: string;
  targetWord: string;
  sourceLanguage: string;
  targetLanguage: string;
  dateAdded: number; // timestamp
  aiGenerated: boolean;
  context?: string;
  groupIds?: string[];
}

export interface LexiGroup {
  id: string;
  name: string;
  description?: string;
  dateAdded: number; // timestamp
}

export interface LanguageStats {
  language: string;
  languageCode: string;
  wordCount: number;
  translationCount: number;
  lastAdded: number; // timestamp
}

export interface AIResponse<T = any> {
  success: boolean;
  data: T;
  confidence?: number;
  error?: string;
}

export interface SearchFilters {
  query: string;
  languages: string[];
  tags: string[];
  dateRange?: {
    start: number;
    end: number;
  };
}

export interface AppStats {
  totalWords: number;
  totalTranslations: number;
  languagesTracked: number;
  recentWords: Word[];
  recentTranslations: Translation[];
  languageStats: LanguageStats[];
}

export type Theme = 'light' | 'dark' | 'system';
export type RevisionMode = 'flashcard' | 'multiple-choice' | 'typing';

export interface AppSettings {
  theme: Theme;
  defaultLanguage: string;
  aiEnabled: boolean;
  groqApiKey: string;
  groqModel: string;
  autoDetectLanguage: boolean;
  shortcutsEnabled: boolean;
  showDeleteConfirmation: boolean;
  dailyReviewGoal: number;
  defaultRevisionMode: RevisionMode;
}
