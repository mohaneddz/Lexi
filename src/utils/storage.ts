// Storage utilities wrapping Tauri store operations

import { LazyStore } from '@tauri-apps/plugin-store';
import type { Word, Translation, AppSettings } from '@/types';

// Initialize the store
const store = new LazyStore('lexi-data.json');

// Store keys
const KEYS = {
  WORDS: 'words',
  TRANSLATIONS: 'translations',
  SETTINGS: 'settings',
} as const;

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultLanguage: 'English',
  aiEnabled: true,
  groqApiKey: '',
  groqModel:
    import.meta.env.MODEL?.trim() ||
    import.meta.env.VITE_GROQ_MODEL?.trim() ||
    'openai/gpt-oss-20b',
  autoDetectLanguage: true,
  shortcutsEnabled: true,
  showDeleteConfirmation: true,
  dailyReviewGoal: 20,
  defaultRevisionMode: 'flashcard',
};

// Words operations
export async function getWords(): Promise<Word[]> {
  const words = await store.get<Word[]>(KEYS.WORDS);
  return words || [];
}

export async function saveWords(words: Word[]): Promise<void> {
  await store.set(KEYS.WORDS, words);
  await store.save();
}

export async function addWord(word: Word): Promise<void> {
  const words = await getWords();
  words.push(word);
  await saveWords(words);
}

export async function updateWord(id: string, updates: Partial<Word>): Promise<void> {
  const words = await getWords();
  const index = words.findIndex(w => w.id === id);
  if (index !== -1) {
    words[index] = { ...words[index], ...updates };
    await saveWords(words);
  }
}

export async function deleteWord(id: string): Promise<void> {
  const words = await getWords();
  const filtered = words.filter(w => w.id !== id);
  await saveWords(filtered);
}

// Translations operations
export async function getTranslations(): Promise<Translation[]> {
  const translations = await store.get<Translation[]>(KEYS.TRANSLATIONS);
  return translations || [];
}

export async function saveTranslations(translations: Translation[]): Promise<void> {
  await store.set(KEYS.TRANSLATIONS, translations);
  await store.save();
}

export async function addTranslation(translation: Translation): Promise<void> {
  const translations = await getTranslations();
  translations.push(translation);
  await saveTranslations(translations);
}

export async function updateTranslation(
  id: string,
  updates: Partial<Translation>
): Promise<void> {
  const translations = await getTranslations();
  const index = translations.findIndex(t => t.id === id);
  if (index !== -1) {
    translations[index] = { ...translations[index], ...updates };
    await saveTranslations(translations);
  }
}

export async function deleteTranslation(id: string): Promise<void> {
  const translations = await getTranslations();
  const filtered = translations.filter(t => t.id !== id);
  await saveTranslations(filtered);
}

// Settings operations
export async function getSettings(): Promise<AppSettings> {
  const settings = await store.get<AppSettings>(KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await store.set(KEYS.SETTINGS, settings);
  await store.save();
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<void> {
  const settings = await getSettings();
  const updated = { ...settings, ...updates };
  await saveSettings(updated);
}

// Clear all data (for reset functionality)
export async function clearAllData(): Promise<void> {
  await store.clear();
  await store.save();
}
