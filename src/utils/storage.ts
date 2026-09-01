// Storage utilities wrapping Tauri store operations

import { LazyStore } from '@tauri-apps/plugin-store';
import { clampSurfaceZoom } from '@/lib/surface-view';
import type { AppSettings, BookCatalogItem, InstalledBook, LexiGroup, SurfaceKey, SurfaceViewPreference, Translation, Word } from '@/types';

// Initialize the store
const store = new LazyStore('lexi-data.json');

// Store keys
const KEYS = {
  WORDS: 'words',
  TRANSLATIONS: 'translations',
  GROUPS: 'groups',
  SETTINGS: 'settings',
  BOOKS_INSTALLED: 'books_installed',
  BOOKS_ACTIVE_IDS: 'books_active_ids',
  BOOKS_CUSTOM_SOURCES: 'books_custom_sources',
} as const;

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultLanguage: 'English',
  defaultDefinitionLanguage: 'English',
  defaultTranslationSourceLanguage: 'English',
  defaultTranslationTargetLanguage: 'English',
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
  launchAtStartup: false,
  startMinimized: false,
  dailyReviewGoal: 20,
  defaultRevisionMode: 'flashcard',
  groupTabsIconOnly: false,
  surfaceViews: {
    inbox: { mode: "list", zoom: 100, detailPanelOpen: true },
    words: { mode: "list", zoom: 100, detailPanelOpen: true },
    definitions: { mode: "list", zoom: 100, detailPanelOpen: true },
    translations: { mode: "list", zoom: 100, detailPanelOpen: true },
  },
};

function normalizeSurfaceViewPreference(
  value: Partial<SurfaceViewPreference> | undefined,
  fallback: SurfaceViewPreference,
): SurfaceViewPreference {
  const zoom = typeof value?.zoom === "number" ? clampSurfaceZoom(value.zoom) : clampSurfaceZoom(fallback.zoom);
  const mode = value?.mode === "grid" || value?.mode === "tiles" || value?.mode === "list"
    ? value.mode
    : fallback.mode;
  const detailPanelOpen = typeof value?.detailPanelOpen === "boolean" ? value.detailPanelOpen : fallback.detailPanelOpen;
  return { mode, zoom, detailPanelOpen };
}

function normalizeSurfaceViews(value: Partial<Record<SurfaceKey, Partial<SurfaceViewPreference>>> | undefined) {
  return {
    inbox: normalizeSurfaceViewPreference(value?.inbox, DEFAULT_SETTINGS.surfaceViews.inbox!),
    words: normalizeSurfaceViewPreference(value?.words, DEFAULT_SETTINGS.surfaceViews.words!),
    definitions: normalizeSurfaceViewPreference(value?.definitions, DEFAULT_SETTINGS.surfaceViews.definitions!),
    translations: normalizeSurfaceViewPreference(value?.translations, DEFAULT_SETTINGS.surfaceViews.translations!),
  };
}

function capitalizeLeadingCharacter(value: string): string {
  return value.replace(/^(\s*)(\S)/, (_match, ws: string, first: string) => `${ws}${first.toUpperCase()}`);
}

function normalizeWord(word: Word): Word {
  return {
    ...word,
    word: capitalizeLeadingCharacter(word.word),
    tags: Array.isArray(word.tags) ? word.tags : [],
    favorite: Boolean(word.favorite),
    examples: Array.isArray(word.examples) ? word.examples : [],
    groupIds: Array.isArray(word.groupIds) ? word.groupIds : [],
  };
}

function normalizeTranslation(translation: Translation): Translation {
  return {
    ...translation,
    sourceWord: capitalizeLeadingCharacter(translation.sourceWord),
    targetWord: capitalizeLeadingCharacter(translation.targetWord),
    favorite: Boolean(translation.favorite),
    groupIds: Array.isArray(translation.groupIds) ? translation.groupIds : [],
  };
}

function normalizeInstalledBook(book: InstalledBook): InstalledBook {
  return {
    ...book,
    inputLanguages: Array.isArray(book.inputLanguages) ? book.inputLanguages : [],
    outputLanguages: Array.isArray(book.outputLanguages) ? book.outputLanguages : [],
    coverUrl: typeof book.coverUrl === "string" ? book.coverUrl : undefined,
    enabled: book.enabled !== false,
    installedAt: typeof book.installedAt === "number" ? book.installedAt : Date.now(),
  };
}

function normalizeGroup(group: LexiGroup): LexiGroup {
  return {
    ...group,
    iconName: typeof group.iconName === "string" && group.iconName.trim() ? group.iconName : "Folder",
  };
}

function normalizeBookCatalogItem(item: BookCatalogItem): BookCatalogItem {
  return {
    ...item,
    inputLanguages: Array.isArray(item.inputLanguages) ? item.inputLanguages : [],
    outputLanguages: Array.isArray(item.outputLanguages) ? item.outputLanguages : [],
    sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : 0,
    coverUrl: typeof item.coverUrl === "string" ? item.coverUrl : undefined,
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
  return (groups || []).map(normalizeGroup);
}

export async function saveGroups(groups: LexiGroup[]): Promise<void> {
  await store.set(KEYS.GROUPS, groups.map(normalizeGroup));
  await store.save();
}

export async function addGroup(group: LexiGroup): Promise<void> {
  const groups = await getGroups();
  groups.push(normalizeGroup(group));
  await saveGroups(groups);
}

export async function updateGroup(id: string, updates: Partial<LexiGroup>): Promise<void> {
  const groups = await getGroups();
  const index = groups.findIndex((group) => group.id === id);
  if (index !== -1) {
    groups[index] = normalizeGroup({ ...groups[index], ...updates });
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
  const settings = await store.get<Partial<AppSettings>>(KEYS.SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };

  return {
    ...merged,
    groupTabsIconOnly: Boolean(settings?.groupTabsIconOnly),
    surfaceViews: normalizeSurfaceViews(settings?.surfaceViews),
    defaultDefinitionLanguage:
      settings?.defaultDefinitionLanguage?.trim() || merged.defaultLanguage || 'English',
    defaultTranslationSourceLanguage:
      settings?.defaultTranslationSourceLanguage?.trim() || merged.defaultLanguage || 'English',
    defaultTranslationTargetLanguage:
      settings?.defaultTranslationTargetLanguage?.trim() || merged.defaultLanguage || 'English',
  };
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

// Books operations
export async function getInstalledBooks(): Promise<InstalledBook[]> {
  const books = await store.get<InstalledBook[]>(KEYS.BOOKS_INSTALLED);
  return (books || []).map(normalizeInstalledBook);
}

export async function saveInstalledBooks(books: InstalledBook[]): Promise<void> {
  await store.set(KEYS.BOOKS_INSTALLED, books.map(normalizeInstalledBook));
  await store.save();
}

export async function upsertInstalledBook(book: InstalledBook): Promise<void> {
  const books = await getInstalledBooks();
  const index = books.findIndex((entry) => entry.id === book.id);
  if (index >= 0) {
    books[index] = normalizeInstalledBook(book);
  } else {
    books.push(normalizeInstalledBook(book));
  }
  await saveInstalledBooks(books);
}

export async function removeInstalledBook(id: string): Promise<void> {
  const books = await getInstalledBooks();
  await saveInstalledBooks(books.filter((book) => book.id !== id));
  const activeIds = await getActiveBookIds();
  await saveActiveBookIds(activeIds.filter((activeId) => activeId !== id));
}

export async function getActiveBookIds(): Promise<string[]> {
  const ids = await store.get<string[]>(KEYS.BOOKS_ACTIVE_IDS);
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}

export async function saveActiveBookIds(ids: string[]): Promise<void> {
  await store.set(KEYS.BOOKS_ACTIVE_IDS, Array.from(new Set(ids)));
  await store.save();
}

export async function toggleActiveBookId(id: string): Promise<string[]> {
  const ids = await getActiveBookIds();
  const next = ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
  await saveActiveBookIds(next);
  return next;
}

export async function getCustomBookSources(): Promise<BookCatalogItem[]> {
  const sources = await store.get<BookCatalogItem[]>(KEYS.BOOKS_CUSTOM_SOURCES);
  return Array.isArray(sources)
    ? sources.filter((entry) => entry && typeof entry.id === "string").map(normalizeBookCatalogItem)
    : [];
}

export async function saveCustomBookSources(sources: BookCatalogItem[]): Promise<void> {
  await store.set(KEYS.BOOKS_CUSTOM_SOURCES, sources.map(normalizeBookCatalogItem));
  await store.save();
}

export async function addCustomBookSource(source: BookCatalogItem): Promise<void> {
  const sources = await getCustomBookSources();
  const index = sources.findIndex((entry) => entry.id === source.id);
  if (index >= 0) {
    sources[index] = source;
  } else {
    sources.push(source);
  }
  await saveCustomBookSources(sources);
}

export async function removeCustomBookSource(id: string): Promise<void> {
  const sources = await getCustomBookSources();
  await saveCustomBookSources(sources.filter((source) => source.id !== id));
}
