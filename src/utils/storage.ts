// Storage utilities wrapping Tauri store operations

import { LazyStore } from '@tauri-apps/plugin-store';
import type { Word, Translation, AppSettings, LexiGroup } from '@/types';

// Initialize the store
const store = new LazyStore('lexi-data.json');

// Store keys
const KEYS = {
  WORDS: 'words',
  TRANSLATIONS: 'translations',
  GROUPS: 'groups',
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
  hideToTray: false,
  dailyReviewGoal: 20,
  defaultRevisionMode: 'flashcard',
};

function normalizeWord(word: Word): Word {
  return {
    ...word,
    tags: Array.isArray(word.tags) ? word.tags : [],
    examples: Array.isArray(word.examples) ? word.examples : [],
    groupIds: Array.isArray(word.groupIds) ? word.groupIds : [],
  };
}

function normalizeTranslation(translation: Translation): Translation {
  return {
    ...translation,
    groupIds: Array.isArray(translation.groupIds) ? translation.groupIds : [],
  };
}

// Words operations
export async function getWords(): Promise<Word[]> {
  const words = await store.get<Word[]>(KEYS.WORDS);
  return (words || []).map(normalizeWord);
}

export async function saveWords(words: Word[]): Promise<void> {
  await store.set(KEYS.WORDS, words.map(normalizeWord));
  await store.save();
}

export async function addWord(word: Word): Promise<void> {
  const words = await getWords();
  words.push(normalizeWord(word));
  await saveWords(words);
}

export async function updateWord(id: string, updates: Partial<Word>): Promise<void> {
  const words = await getWords();
  const index = words.findIndex(w => w.id === id);
  if (index !== -1) {
    words[index] = normalizeWord({ ...words[index], ...updates });
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
  return (translations || []).map(normalizeTranslation);
}

export async function saveTranslations(translations: Translation[]): Promise<void> {
  await store.set(KEYS.TRANSLATIONS, translations.map(normalizeTranslation));
  await store.save();
}

export async function addTranslation(translation: Translation): Promise<void> {
  const translations = await getTranslations();
  translations.push(normalizeTranslation(translation));
  await saveTranslations(translations);
}

export async function updateTranslation(
  id: string,
  updates: Partial<Translation>
): Promise<void> {
  const translations = await getTranslations();
  const index = translations.findIndex(t => t.id === id);
  if (index !== -1) {
    translations[index] = normalizeTranslation({ ...translations[index], ...updates });
    await saveTranslations(translations);
  }
}

export async function deleteTranslation(id: string): Promise<void> {
  const translations = await getTranslations();
  const filtered = translations.filter(t => t.id !== id);
  await saveTranslations(filtered);
}

// Groups operations
export async function getGroups(): Promise<LexiGroup[]> {
  const groups = await store.get<LexiGroup[]>(KEYS.GROUPS);
  return groups || [];
}

export async function saveGroups(groups: LexiGroup[]): Promise<void> {
  await store.set(KEYS.GROUPS, groups);
  await store.save();
}

export async function addGroup(group: LexiGroup): Promise<void> {
  const groups = await getGroups();
  groups.push(group);
  await saveGroups(groups);
}

export async function updateGroup(id: string, updates: Partial<LexiGroup>): Promise<void> {
  const groups = await getGroups();
  const index = groups.findIndex((group) => group.id === id);
  if (index !== -1) {
    groups[index] = { ...groups[index], ...updates };
    await saveGroups(groups);
  }
}

export async function deleteGroup(id: string): Promise<void> {
  const groups = await getGroups();
  const filteredGroups = groups.filter((group) => group.id !== id);
  await saveGroups(filteredGroups);

  const words = await getWords();
  const nextWords = words.map((word) => ({
    ...word,
    groupIds: (word.groupIds || []).filter((groupId) => groupId !== id),
  }));
  await saveWords(nextWords);

  const translations = await getTranslations();
  const nextTranslations = translations.map((translation) => ({
    ...translation,
    groupIds: (translation.groupIds || []).filter((groupId) => groupId !== id),
  }));
  await saveTranslations(nextTranslations);
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
