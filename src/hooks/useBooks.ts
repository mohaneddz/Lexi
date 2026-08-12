import { useCallback, useEffect, useMemo, useState } from "react";

import type { BookCatalogItem, BookPayload, InstalledBook } from "@/types";
import {
  addCustomBookSource,
  getActiveBookIds,
  getCustomBookSources,
  getInstalledBooks,
  removeCustomBookSource,
  removeInstalledBook,
  saveActiveBookIds,
  upsertInstalledBook,
} from "@/utils/storage";
import {
  catalogItemFromPayload,
  deleteInstalledBookPayload,
  downloadBookPayload,
  importBookPayloadFromFile,
  loadPayloadFromSourceUrl,
  loadStarterCatalog,
  readInstalledBookPayload,
  saveInstalledBookPayload,
  verifyChecksum,
} from "@/utils/books";
import { fuzzyScore } from "@/utils/fuzzy";

type LookupScope = "selected" | "all";
const LEGACY_PLACEHOLDER_BOOK_IDS = new Set(["dict-essential-en", "trans-en-fr-es", "trans-en-ar-de"]);

export type BookSearchFilters = {
  bookType?: "all" | "dictionary" | "translation";
  inputLanguage?: string;
  outputLanguage?: string;
  bookIds?: string[];
  scope?: LookupScope;
  fuzzy?: boolean;
};

export type BookSearchResult = {
  id: string;
  bookId: string;
  bookTitle: string;
  bookType: "dictionary" | "translation";
  input: string;
  output: string;
  inputLanguage: string;
  outputLanguage: string;
  score: number;
};

export function useBooks() {
  const [catalog, setCatalog] = useState<BookCatalogItem[]>([]);
  const [installedBooks, setInstalledBooks] = useState<InstalledBook[]>([]);
  const [activeBookIds, setActiveBookIds] = useState<string[]>([]);
  const [bookPayloads, setBookPayloads] = useState<Record<string, BookPayload>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installingIds, setInstallingIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [starterCatalog, customSources, installed, active] = await Promise.all([
        loadStarterCatalog(),
        getCustomBookSources(),
        getInstalledBooks(),
        getActiveBookIds(),
      ]);
      const installedFiltered = installed.filter((book) => !LEGACY_PLACEHOLDER_BOOK_IDS.has(book.id));
      const activeFiltered = active.filter((bookId) => !LEGACY_PLACEHOLDER_BOOK_IDS.has(bookId));
      if (activeFiltered.length !== active.length) {
        await saveActiveBookIds(activeFiltered);
      }

      const catalogMap = new Map<string, BookCatalogItem>();
      for (const item of starterCatalog) {
        catalogMap.set(item.id, item);
      }
      for (const item of customSources) {
        catalogMap.set(item.id, item);
      }

      const payloadEntries = await Promise.all(
        installedFiltered.map(async (book) => {
          try {
            const payload = await readInstalledBookPayload(book.localPath);
            return [book.id, payload] as const;
          } catch {
            return null;
          }
        }),
      );

      const payloadMap: Record<string, BookPayload> = {};
      for (const entry of payloadEntries) {
        if (entry) {
          payloadMap[entry[0]] = entry[1];
        }
      }

      setCatalog(Array.from(catalogMap.values()).sort((a, b) => a.title.localeCompare(b.title)));
      setInstalledBooks(installedFiltered);
      setActiveBookIds(activeFiltered);
      setBookPayloads(payloadMap);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load books.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setInstalling = (id: string, installing: boolean) => {
    setInstallingIds((current) => {
      if (installing) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((entry) => entry !== id);
    });
  };

  const installFromPayload = useCallback(async (payload: BookPayload, sourceItem: BookCatalogItem) => {
    await verifyChecksum(payload, sourceItem.checksum);
    const localPath = await saveInstalledBookPayload(payload.id, payload.version, payload);

    const installedBook: InstalledBook = {
      id: payload.id,
      title: payload.title,
      type: payload.type,
      version: payload.version,
      description: payload.description,
      source: sourceItem.source,
      sourceUrl: sourceItem.sourceUrl,
      coverUrl: payload.coverUrl || sourceItem.coverUrl,
      inputLanguages: payload.inputLanguages,
      outputLanguages: payload.outputLanguages,
      sizeBytes: sourceItem.sizeBytes || JSON.stringify(payload).length,
      checksum: sourceItem.checksum,
      localPath,
      installedAt: Date.now(),
      enabled: true,
    };

    await upsertInstalledBook(installedBook);

    const currentActive = await getActiveBookIds();
    if (!currentActive.includes(installedBook.id)) {
      await saveActiveBookIds([...currentActive, installedBook.id]);
    }

    await refresh();
  }, [refresh]);

  const installBook = useCallback(async (book: BookCatalogItem) => {
    setInstalling(book.id, true);
    try {
      const payload = await loadPayloadFromSourceUrl(book.sourceUrl);
      await installFromPayload(payload, book);
    } finally {
      setInstalling(book.id, false);
    }
  }, [installFromPayload]);

  const uninstallBook = useCallback(async (bookId: string) => {
    const installed = installedBooks.find((entry) => entry.id === bookId);
    if (!installed) {
      return;
    }

    await deleteInstalledBookPayload(installed.localPath);
    await removeInstalledBook(bookId);
    await refresh();
  }, [installedBooks, refresh]);

  const toggleBookActive = useCallback(async (bookId: string) => {
    const next = activeBookIds.includes(bookId)
      ? activeBookIds.filter((id) => id !== bookId)
      : [...activeBookIds, bookId];
    await saveActiveBookIds(next);
    setActiveBookIds(next);
  }, [activeBookIds]);

  const addCustomSourceFromUrl = useCallback(async (url: string) => {
    const payload = await downloadBookPayload(url);
    const item = catalogItemFromPayload(payload, url, "Custom URL");
    await addCustomBookSource(item);
    await refresh();
  }, [refresh]);

  const importCustomSourceFromFile = useCallback(async () => {
    const payload = await importBookPayloadFromFile();
    if (!payload) {
      return;
    }

    const sourceUrl = `local-file:${payload.id}:${payload.version}:${Date.now()}`;
    const item = catalogItemFromPayload(payload, sourceUrl, "Imported File");
    await addCustomBookSource(item);
    await installFromPayload(payload, item);
  }, [installFromPayload]);

  const removeCustomSource = useCallback(async (bookId: string) => {
    await removeCustomBookSource(bookId);
    await refresh();
  }, [refresh]);

  const installedById = useMemo(() => {
    const map = new Map<string, InstalledBook>();
    for (const book of installedBooks) {
      map.set(book.id, book);
    }
    return map;
  }, [installedBooks]);

  const lookup = useCallback((query: string, filters: BookSearchFilters = {}): BookSearchResult[] => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const fuzzy = filters.fuzzy !== false;
    const scope = filters.scope ?? "selected";
    const allowedBookIds = new Set(filters.bookIds ?? []);

    const results: BookSearchResult[] = [];
    for (const book of installedBooks) {
      if (scope === "selected" && !activeBookIds.includes(book.id)) {
        continue;
      }
      if (scope === "all" && !book.enabled) {
        continue;
      }
      if (allowedBookIds.size > 0 && !allowedBookIds.has(book.id)) {
        continue;
      }
      if (filters.bookType && filters.bookType !== "all" && book.type !== filters.bookType) {
        continue;
      }

      const payload = bookPayloads[book.id];
      if (!payload) {
        continue;
      }

      if (payload.type === "dictionary") {
        for (const entry of payload.entries) {
          if (filters.inputLanguage && entry.language !== filters.inputLanguage) {
            continue;
          }
          if (filters.outputLanguage && entry.language !== filters.outputLanguage) {
            continue;
          }

          const searchable = [entry.term, ...(entry.aliases || []), entry.definition].join(" ");
          const exactHit = searchable.toLowerCase().includes(normalized);
          const score = exactHit ? 1 : fuzzy ? fuzzyScore(normalized, searchable) : 0;
          if (score < 0.38) {
            continue;
          }

          results.push({
            id: `${book.id}:${entry.term}:${entry.language}`,
            bookId: book.id,
            bookTitle: book.title,
            bookType: "dictionary",
            input: entry.term,
            output: entry.definition,
            inputLanguage: entry.language,
            outputLanguage: entry.language,
            score,
          });
        }
        continue;
      }

      for (const entry of payload.entries) {
        if (filters.inputLanguage && entry.sourceLanguage !== filters.inputLanguage) {
          continue;
        }
        if (filters.outputLanguage && entry.targetLanguage !== filters.outputLanguage) {
          continue;
        }

        const searchable = [
          entry.source,
          entry.target,
          entry.sourceLanguage,
          entry.targetLanguage,
          ...(entry.aliases || []),
        ].join(" ");
        const exactHit = searchable.toLowerCase().includes(normalized);
        const score = exactHit ? 1 : fuzzy ? fuzzyScore(normalized, searchable) : 0;
        if (score < 0.38) {
          continue;
        }

        results.push({
          id: `${book.id}:${entry.source}:${entry.target}`,
          bookId: book.id,
          bookTitle: book.title,
          bookType: "translation",
          input: entry.source,
          output: entry.target,
          inputLanguage: entry.sourceLanguage,
          outputLanguage: entry.targetLanguage,
          score,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score || a.input.localeCompare(b.input));
  }, [activeBookIds, bookPayloads, installedBooks]);

  return {
    catalog,
    installedBooks,
    installedById,
    activeBookIds,
    loading,
    error,
    installingIds,
    refresh,
    installBook,
    uninstallBook,
    toggleBookActive,
    addCustomSourceFromUrl,
    importCustomSourceFromFile,
    removeCustomSource,
    lookup,
  };
}
