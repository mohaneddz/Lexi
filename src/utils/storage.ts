// Storage utilities wrapping Tauri store operations

import { LazyStore } from '@tauri-apps/plugin-store';
import { clampSurfaceZoom } from '@/lib/surface-view';
import { capitalizeTerm } from '@/utils/formatters';
import { isReviewStatusTag, reviewStateFromLegacyTags } from '@/utils/review';
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
  AI_CACHE: 'ai_cache',
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
  showShortcutHints: true,
  showDeleteConfirmation: true,
  hideToTray: false,
  launchAtStartup: false,
  startMinimized: false,
  dailyReviewGoal: 20,
  defaultRevisionMode: 'flashcard',
  showReviewQueueAnswers: false,
  groupTabsIconOnly: false,
  othersGroupEnabled: true,
  homeSuggestionCount: 4,
  definitionSuggestionCount: 4,
  translationSuggestionCount: 4,
  surfaceViews: {
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
    definitions: normalizeSurfaceViewPreference(value?.definitions, DEFAULT_SETTINGS.surfaceViews.definitions!),
    translations: normalizeSurfaceViewPreference(value?.translations, DEFAULT_SETTINGS.surfaceViews.translations!),
  };
}

function normalizeWord(word: Word): Word {
  const tags = Array.isArray(word.tags) ? word.tags : [];
  return {
    ...word,
    word: capitalizeTerm(word.word),
    // Status used to be kept as tags; it now lives in `review`, and the
    // old tags are converted once and dropped.
    review: word.review ?? reviewStateFromLegacyTags(tags, word.dateAdded),
    tags: tags.filter((tag) => !isReviewStatusTag(tag)),
    favorite: Boolean(word.favorite),
    examples: Array.isArray(word.examples) ? word.examples : [],
    groupIds: Array.isArray(word.groupIds) ? word.groupIds : [],
  };
}

function normalizeTranslation(translation: Translation): Translation {
  return {
    ...translation,
    sourceWord: capitalizeTerm(translation.sourceWord),
    targetWord: capitalizeTerm(translation.targetWord),
    favorite: Boolean(translation.favorite),
    review: translation.review ?? reviewStateFromLegacyTags(translation.tags ?? [], translation.dateAdded),
    tags: Array.isArray(translation.tags) ? translation.tags.filter((tag) => !isReviewStatusTag(tag)) : [],
    groupIds: Array.isArray(translation.groupIds) ? translation.groupIds : [],
    sourceExamples: Array.isArray(translation.sourceExamples) ? translation.sourceExamples : [],
    targetExamples: Array.isArray(translation.targetExamples) ? translation.targetExamples : [],
  };
}

function normalizeInstalledBook(book: InstalledBook): InstalledBook {
  return {
    ...book,
    inputLanguages: Array.isArray(book.inputLanguages) ? book.inputLanguages : [],
    outputLanguages: Array.isArray(book.outputLanguages) ? book.outputLanguages : [],
    coverUrl: typeof book.coverUrl === "string" ? book.coverUrl : undefined,
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

/** Applies many word updates in one store write, for sweeps like auto-tagging. */
export async function updateWordsBulk(changes: Record<string, Partial<Word>>): Promise<void> {
  const words = await getWords();
  await saveWords(words.map((word) => (changes[word.id] ? normalizeWord({ ...word, ...changes[word.id] }) : word)));
}

/** Deletes many words in one store write, e.g. emptying a group. */
export async function deleteWordsBulk(ids: string[]): Promise<void> {
  const remove = new Set(ids);
  const words = await getWords();
  await saveWords(words.filter((word) => !remove.has(word.id)));
  for (const id of ids) {
    await writeAiCache('distractors', id, undefined);
    await writeAiCache('relatedWords', id, undefined);
  }
}

export async function deleteWord(id: string): Promise<void> {
  const words = await getWords();
  const filtered = words.filter(w => w.id !== id);
  await saveWords(filtered);
  await writeAiCache('distractors', id, undefined);
  await writeAiCache('relatedWords', id, undefined);
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

/** Applies many translation updates in one store write. */
export async function updateTranslationsBulk(changes: Record<string, Partial<Translation>>): Promise<void> {
  const translations = await getTranslations();
  await saveTranslations(translations.map((translation) => (
    changes[translation.id] ? normalizeTranslation({ ...translation, ...changes[translation.id] }) : translation
  )));
}

/** Deletes many translations in one store write. */
export async function deleteTranslationsBulk(ids: string[]): Promise<void> {
  const remove = new Set(ids);
  const translations = await getTranslations();
  await saveTranslations(translations.filter((translation) => !remove.has(translation.id)));
  for (const id of ids) {
    await writeAiCache('relatedTranslations', id, undefined);
  }
}

export async function deleteTranslation(id: string): Promise<void> {
  const translations = await getTranslations();
  const filtered = translations.filter(t => t.id !== id);
  await saveTranslations(filtered);
  await writeAiCache('relatedTranslations', id, undefined);
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

let ensuringOthers: Promise<void> | null = null;

/**
 * Makes sure the built-in Others group exists, adopting a hand-made group
 * named "Others" if there is one so its words aren't split across two.
 */
export function ensureOthersGroup(): Promise<void> {
  ensuringOthers ??= (async () => {
    const groups = await getGroups();
    if (groups.some((group) => group.isOthers)) return;

    const byName = groups.find((group) => group.name.trim().toLowerCase() === 'others');
    if (byName) {
      byName.isOthers = true;
    } else {
      groups.push({ id: crypto.randomUUID(), name: 'Others', iconName: 'Inbox', dateAdded: Date.now(), isOthers: true });
    }
    await saveGroups(groups);
  })().finally(() => {
    ensuringOthers = null;
  });
  return ensuringOthers;
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

export const MIN_SUGGESTION_COUNT = 1;
export const MAX_SUGGESTION_COUNT = 10;

function clampSuggestionCount(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 4;
  return Math.min(MAX_SUGGESTION_COUNT, Math.max(MIN_SUGGESTION_COUNT, numeric));
}

// Settings operations
export async function getSettings(): Promise<AppSettings> {
  const settings = await store.get<Partial<AppSettings>>(KEYS.SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };

  return {
    ...merged,
    groupTabsIconOnly: Boolean(settings?.groupTabsIconOnly),
    homeSuggestionCount: clampSuggestionCount(merged.homeSuggestionCount),
    definitionSuggestionCount: clampSuggestionCount(merged.definitionSuggestionCount),
    translationSuggestionCount: clampSuggestionCount(merged.translationSuggestionCount),
    // Older builds stored this as the Others auto-assign fallback toggle.
    othersGroupEnabled: typeof settings?.othersGroupEnabled === 'boolean'
      ? settings.othersGroupEnabled
      : (settings as { autoAssignOthersGroup?: boolean } | undefined)?.autoAssignOthersGroup ?? true,
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

// AI results worth keeping between sessions, so revisiting a page doesn't
// spend API quota regenerating what was already produced. Grouped by
// feature, then keyed by whatever the result belongs to (a word id, a Home
// section, ...).
export type AiCacheNamespace = 'homeSuggestions' | 'relatedTranslations' | 'relatedWords' | 'distractors';

type AiCache = Partial<Record<AiCacheNamespace, Record<string, unknown>>>;

// Writes are read-modify-write on one store key, so they're queued to keep
// several sections finishing at once from overwriting each other.
let aiCacheWrites: Promise<void> = Promise.resolve();

export async function readAiCache<T>(namespace: AiCacheNamespace): Promise<Record<string, T>> {
  const cache = await store.get<AiCache>(KEYS.AI_CACHE);
  return (cache?.[namespace] ?? {}) as Record<string, T>;
}

export async function readAiCacheEntry<T>(namespace: AiCacheNamespace, key: string): Promise<T | undefined> {
  return (await readAiCache<T>(namespace))[key];
}

/** Passing `undefined` removes the entry. */
export function writeAiCache(namespace: AiCacheNamespace, key: string, value: unknown): Promise<void> {
  aiCacheWrites = aiCacheWrites.then(async () => {
    const cache = (await store.get<AiCache>(KEYS.AI_CACHE)) ?? {};
    const entries = { ...(cache[namespace] ?? {}) };
    if (value === undefined) {
      if (!(key in entries)) return;
      delete entries[key];
    } else {
      entries[key] = value;
    }
    await store.set(KEYS.AI_CACHE, { ...cache, [namespace]: entries });
    await store.save();
  }).catch((error) => {
    console.error('Failed to write AI cache', error);
  });
  return aiCacheWrites;
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
  const enabledIds = await getEnabledBookIds();
  await saveEnabledBookIds(enabledIds.filter((enabledId) => enabledId !== id));
}

// Which books count toward search. A catalog book with no entry here is
// simply never fetched, so there is nothing else to "install" or "remove".
export async function getEnabledBookIds(): Promise<string[]> {
  const ids = await store.get<string[]>(KEYS.BOOKS_ACTIVE_IDS);
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}

export async function saveEnabledBookIds(ids: string[]): Promise<void> {
  await store.set(KEYS.BOOKS_ACTIVE_IDS, Array.from(new Set(ids)));
  await store.save();
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
