import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  importBookPayloadFromFile,
  loadPayloadFromSourceUrl,
  loadStarterCatalog,
  readInstalledBookPayload,
  saveInstalledBookPayload,
  verifyChecksum,
} from "@/utils/books";
import { getBookIndex, matchBook, type MatchKind } from "@/utils/bookSearch";

type LookupScope = "selected" | "all";

/**
 * Books that were pulled from the catalog. Any copy still sitting in AppData
 * is deleted on the next load so it stops showing up in search results.
 * The heritage packs were a corrupted, smaller cut of the same public-domain
 * dictionary that Webster's Unabridged already covers.
 */
const RETIRED_BOOK_IDS = new Set([
  "dict-essential-en",
  "trans-en-fr-es",
  "trans-en-ar-de",
  "dict-english-heritage-ae",
  "dict-english-heritage-fk",
  "dict-english-heritage-lq",
  "dict-english-heritage-rz",
]);

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
  matchKind: MatchKind;
  termLength: number;
};

export function useBooks() {
  const [catalog, setCatalog] = useState<BookCatalogItem[]>([]);
  const [installedBooks, setInstalledBooks] = useState<InstalledBook[]>([]);
  const [activeBookIds, setActiveBookIds] = useState<string[]>([]);
  const [bookPayloads, setBookPayloads] = useState<Record<string, BookPayload>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installingIds, setInstallingIds] = useState<string[]>([]);

  // Installed payloads can be tens of megabytes each; keep a ref so refresh()
  // can skip re-reading ones already in memory instead of blocking the UI
  // every time it runs.
  const bookPayloadsRef = useRef<Record<string, BookPayload>>({});
  useEffect(() => {
    bookPayloadsRef.current = bookPayloads;
  }, [bookPayloads]);

  const refresh = useCallback(async (options: { showLoading?: boolean } = {}) => {
    const { showLoading = true } = options;
    if (showLoading) {
      setLoading(true);
    }
    try {
      const [starterCatalog, customSources, installed, active] = await Promise.all([
        loadStarterCatalog(),
        getCustomBookSources(),
        getInstalledBooks(),
        getActiveBookIds(),
      ]);
      const installedFiltered = installed.filter((book) => !RETIRED_BOOK_IDS.has(book.id));
      const activeFiltered = active.filter((bookId) => !RETIRED_BOOK_IDS.has(bookId));
      if (activeFiltered.length !== active.length) {
        await saveActiveBookIds(activeFiltered);
      }

      for (const book of installed) {
        if (!RETIRED_BOOK_IDS.has(book.id)) continue;
        await deleteInstalledBookPayload(book.localPath).catch(() => {});
        await removeInstalledBook(book.id);
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
          const cached = bookPayloadsRef.current[book.id];
          if (cached && cached.version === book.version) {
            return [book.id, cached] as const;
          }
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
      if (showLoading) {
        setLoading(false);
      }
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

    setInstalledBooks((current) => [...current.filter((book) => book.id !== installedBook.id), installedBook]);
    setBookPayloads((current) => ({ ...current, [installedBook.id]: payload }));

    const currentActive = await getActiveBookIds();
    if (!currentActive.includes(installedBook.id)) {
      const nextActive = [...currentActive, installedBook.id];
      await saveActiveBookIds(nextActive);
      setActiveBookIds(nextActive);
    }
  }, []);

  const installBook = useCallback(async (book: BookCatalogItem) => {
    setInstalling(book.id, true);
    setError(null);
    try {
      const payload = await loadPayloadFromSourceUrl(book.sourceUrl);
      await installFromPayload(payload, book);
    } catch (installError) {
      setError(
        installError instanceof Error
          ? `Could not install "${book.title}": ${installError.message}`
          : `Could not install "${book.title}".`,
      );
    } finally {
      setInstalling(book.id, false);
    }
  }, [installFromPayload]);

  const uninstallBook = useCallback(async (bookId: string) => {
    const installed = installedBooks.find((entry) => entry.id === bookId);
    if (!installed) {
      return;
    }

    setError(null);
    try {
      await deleteInstalledBookPayload(installed.localPath);
      await removeInstalledBook(bookId);

      setInstalledBooks((current) => current.filter((book) => book.id !== bookId));
      setBookPayloads((current) => {
        const next = { ...current };
        delete next[bookId];
        return next;
      });

      const currentActive = await getActiveBookIds();
      if (currentActive.includes(bookId)) {
        const nextActive = currentActive.filter((id) => id !== bookId);
        await saveActiveBookIds(nextActive);
        setActiveBookIds(nextActive);
      }
    } catch (uninstallError) {
      setError(
        uninstallError instanceof Error
          ? `Could not remove "${installed.title}": ${uninstallError.message}`
          : `Could not remove "${installed.title}".`,
      );
    }
  }, [installedBooks]);

  const toggleBookActive = useCallback(async (bookId: string) => {
    const next = activeBookIds.includes(bookId)
      ? activeBookIds.filter((id) => id !== bookId)
      : [...activeBookIds, bookId];
    await saveActiveBookIds(next);
    setActiveBookIds(next);
  }, [activeBookIds]);

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
    await refresh({ showLoading: false });
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

      const index = getBookIndex(payload);
      for (const match of matchBook(index, normalized, { fuzzy })) {
        const record = index.records[match.recordIndex];
        if (filters.inputLanguage && record.inputLanguage !== filters.inputLanguage) {
          continue;
        }
        if (filters.outputLanguage && record.outputLanguage !== filters.outputLanguage) {
          continue;
        }

        results.push({
          id: `${book.id}:${match.recordIndex}`,
          bookId: book.id,
          bookTitle: book.title,
          bookType: book.type,
          input: record.input,
          output: record.output,
          inputLanguage: record.inputLanguage,
          outputLanguage: record.outputLanguage,
          score: match.score,
          matchKind: match.kind,
          termLength: match.keyLength,
        });
      }
    }

    // Several books are cuts of the same public-domain dictionary, so collapse
    // identical term/definition pairs to whichever copy scored highest.
    const deduped = new Map<string, BookSearchResult>();
    for (const result of results) {
      const key = `${result.input.toLowerCase()}::${result.output}`;
      const existing = deduped.get(key);
      if (!existing || result.score > existing.score) {
        deduped.set(key, result);
      }
    }

    return Array.from(deduped.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.termLength !== b.termLength) return a.termLength - b.termLength;
      return a.input.localeCompare(b.input);
    });
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
    importCustomSourceFromFile,
    removeCustomSource,
    lookup,
  };
}
