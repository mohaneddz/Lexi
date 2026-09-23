// Type definitions for Lexi

export interface Word {
  id: string;
  word: string;
  definition: string;
  language: string;
  dateAdded: number; // timestamp
  tags: string[];
  aiGenerated: boolean;
  favorite?: boolean;
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
  favorite?: boolean;
  context?: string;
  groupIds?: string[];
  sourceExamples?: string[];
  targetExamples?: string[];
}

export type BookType = "dictionary" | "translation";

export interface BookCatalogItem {
  id: string;
  title: string;
  type: BookType;
  version: string;
  description: string;
  source: string;
  sourceUrl: string;
  coverUrl?: string;
  inputLanguages: string[];
  outputLanguages: string[];
  sizeBytes: number;
  checksum?: string;
}

// A book whose payload is stored as a local file rather than fetched from a
// bundled asset — currently only books imported from a JSON file, since
// catalog books ship inside the app and are read directly, never copied.
export interface InstalledBook extends BookCatalogItem {
  localPath: string;
  installedAt: number;
}

export interface DictionaryBookEntry {
  term: string;
  aliases?: string[];
  language: string;
  definition: string;
}

export interface TranslationBookEntry {
  source: string;
  target: string;
  sourceLanguage: string;
  targetLanguage: string;
  aliases?: string[];
}

export interface DictionaryBookPayload {
  id: string;
  title: string;
  version: string;
  type: "dictionary";
  description: string;
  coverUrl?: string;
  inputLanguages: string[];
  outputLanguages: string[];
  entries: DictionaryBookEntry[];
}

export interface TranslationBookPayload {
  id: string;
  title: string;
  version: string;
  type: "translation";
  description: string;
  coverUrl?: string;
  inputLanguages: string[];
  outputLanguages: string[];
  entries: TranslationBookEntry[];
}

export type BookPayload = DictionaryBookPayload | TranslationBookPayload;

export interface LexiGroup {
  id: string;
  name: string;
  iconName?: string;
  description?: string;
  dateAdded: number; // timestamp
  /** The built-in catch-all group, managed by the "Others" setting rather than by hand. */
  isOthers?: boolean;
}

export type ViewMode = "list" | "grid" | "tiles";
export type SurfaceKey = "definitions" | "translations";

export interface SurfaceViewPreference {
  mode: ViewMode;
  zoom: number;
  detailPanelOpen: boolean;
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
  defaultDefinitionLanguage: string;
  defaultTranslationSourceLanguage: string;
  defaultTranslationTargetLanguage: string;
  aiEnabled: boolean;
  groqApiKey: string;
  groqModel: string;
  autoDetectLanguage: boolean;
  shortcutsEnabled: boolean;
  showDeleteConfirmation: boolean;
  hideToTray: boolean;
  launchAtStartup: boolean;
  startMinimized: boolean;
  dailyReviewGoal: number;
  defaultRevisionMode: RevisionMode;
  groupTabsIconOnly: boolean;
  /** Keeps the built-in Others group: shown in tabs and Home, and used when auto-assign finds no match. */
  othersGroupEnabled: boolean;
  surfaceViews: Partial<Record<SurfaceKey, SurfaceViewPreference>>;
}
