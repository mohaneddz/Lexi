import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BookCatalogItem, BookPayload, InstalledBook } from "@/types";
import {
  addCustomBookSource,
  getEnabledBookIds,
  getCustomBookSources,
  getInstalledBooks,
  removeCustomBookSource,
  removeInstalledBook,
  saveEnabledBookIds,
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
} from "@/utils/books";
import { getBookIndex, matchBook, type MatchKind } from "@/utils/bookSearch";

// A book imported from a file is the only kind with a real local copy to
// clean up; everything else ships inside the app and is read from there.
const IMPORTED_SOURCE = "Imported File";

export type BookSearchFilters = {
  bookType?: "all" | "dictionary" | "translation";
  inputLanguage?: string;
  outputLanguage?: string;
  /** Narrows to specific enabled books instead of all of them. */
  bookIds?: string[];
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
  const [importedBooks, setImportedBooks] = useState<InstalledBook[]>([]);
  const [enabledBookIds, setEnabledBookIds] = useState<string[]>([]);
  const [bookPayloads, setBookPayloads] = useState<Record<string, BookPayload>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingBookIds, setLoadingBookIds] = useState<string[]>([]);

  // Payloads and imported-book records are read inside callbacks that must
  // stay referentially stable, so a ref tracks the latest value without
  // pulling either into those callbacks' dependency arrays.
  const bookPayloadsRef = useRef<Record<string, BookPayload>>({});
  useEffect(() => {
    bookPayloadsRef.current = bookPayloads;
  }, [bookPayloads]);

  const importedBooksRef = useRef<InstalledBook[]>([]);
  useEffect(() => {
    importedBooksRef.current = importedBooks;
  }, [importedBooks]);

  const catalogRef = useRef<BookCatalogItem[]>([]);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  const setLoadingBook = (id: string, isLoading: boolean) => {
    setLoadingBookIds((current) => {
      if (isLoading) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((entry) => entry !== id);
    });
  };

  /** Fetches a book's payload (bundled asset or an imported file) and caches it. */
  const loadPayload = useCallback(async (bookId: string): Promise<BookPayload> => {
    const cached = bookPayloadsRef.current[bookId];
    if (cached) {
      return cached;
    }

    const imported = importedBooksRef.current.find((book) => book.id === bookId);
    if (imported) {
      const payload = await readInstalledBookPayload(imported.localPath);
      setBookPayloads((current) => ({ ...current, [bookId]: payload }));
      return payload;
    }

    const catalogItem = catalogRef.current.find((book) => book.id === bookId);
    if (!catalogItem) {
      throw new Error("Unknown book.");
    }

    const payload = await loadPayloadFromSourceUrl(catalogItem.sourceUrl);
    setBookPayloads((current) => ({ ...current, [bookId]: payload }));
    return payload;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [starterCatalog, customSources, installed, enabled] = await Promise.all([
        loadStarterCatalog(),
        getCustomBookSources(),
        getInstalledBooks(),
        getEnabledBookIds(),
      ]);

      // Only a genuine file import has a real local copy worth keeping. A
      // record left over from the old install-to-disk model just wastes
      // space the app already spends once on the bundled asset.
      const imported = installed.filter((book) => book.source === IMPORTED_SOURCE);
      const stale = installed.filter((book) => book.source !== IMPORTED_SOURCE);
      await Promise.all(stale.map(async (book) => {
        await deleteInstalledBookPayload(book.localPath).catch(() => {});
        await removeInstalledBook(book.id);
      }));

      const catalogMap = new Map<string, BookCatalogItem>();
      for (const item of starterCatalog) catalogMap.set(item.id, item);
      for (const item of customSources) catalogMap.set(item.id, item);
      const nextCatalog = Array.from(catalogMap.values()).sort((a, b) => a.title.localeCompare(b.title));

      const knownIds = new Set(nextCatalog.map((item) => item.id));
      const nextEnabled = enabled.filter((id) => knownIds.has(id));
      if (nextEnabled.length !== enabled.length) {
        await saveEnabledBookIds(nextEnabled);
      }

      setCatalog(nextCatalog);
      setImportedBooks(imported);
      setEnabledBookIds(nextEnabled);
      setError(null);

      // Populate payloads for whatever was already enabled from a previous
      // session; a failure here disables that one book rather than blocking
      // the rest of the catalog from loading.
      catalogRef.current = nextCatalog;
      importedBooksRef.current = imported;
      const stillMissing = nextEnabled.filter((id) => !bookPayloadsRef.current[id]);
      await Promise.all(stillMissing.map(async (id) => {
        try {
          await loadPayload(id);
        } catch {
          setEnabledBookIds((current) => {
            const without = current.filter((entry) => entry !== id);
            void saveEnabledBookIds(without);
            return without;
          });
        }
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load books.");
    } finally {
      setLoading(false);
    }
  }, [loadPayload]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Enables or disables a whole batch of books atomically, so a group of
   * language variants can be turned on together from one click without the
   * usual per-call closure race: calling the single-book toggle N times in
   * a row would have each call read the same stale enabledBookIds it was
   * rendered with, so only the last call's change would actually stick.
   */
  const setBooksEnabled = useCallback(async (bookIds: string[], enabled: boolean) => {
    setError(null);
    const idSet = new Set(bookIds);

    if (!enabled) {
      const next = enabledBookIds.filter((id) => !idSet.has(id));
      await saveEnabledBookIds(next);
      setEnabledBookIds(next);
      // Keep payloads cached in memory rather than evicting them, so
      // re-enabling later in the session is instant instead of re-fetching
      // packs that can be 25MB+.
      return;
    }

    const next = Array.from(new Set([...enabledBookIds, ...bookIds]));
    await saveEnabledBookIds(next);
    setEnabledBookIds(next);

    const toLoad = bookIds.filter((id) => !bookPayloadsRef.current[id]);
    if (toLoad.length === 0) {
      return;
    }

    toLoad.forEach((id) => setLoadingBook(id, true));
    try {
      const settled = await Promise.allSettled(toLoad.map((id) => loadPayload(id)));
      const failedIds = toLoad.filter((_id, index) => settled[index].status === "rejected");

      if (failedIds.length > 0) {
        const rolledBack = next.filter((id) => !failedIds.includes(id));
        await saveEnabledBookIds(rolledBack);
        setEnabledBookIds(rolledBack);

        const titles = failedIds
          .map((id) => catalogRef.current.find((book) => book.id === id)?.title ?? id)
          .join(", ");
        setError(
          failedIds.length === toLoad.length
            ? `Could not enable "${titles}".`
            : `Could not enable ${failedIds.length} of ${toLoad.length} variants: ${titles}.`,
        );
      }
    } finally {
      toLoad.forEach((id) => setLoadingBook(id, false));
    }
  }, [enabledBookIds, loadPayload]);

  const toggleBookEnabled = useCallback(async (bookId: string) => {
    await setBooksEnabled([bookId], !enabledBookIds.includes(bookId));
  }, [enabledBookIds, setBooksEnabled]);

  const importCustomSourceFromFile = useCallback(async () => {
    const payload = await importBookPayloadFromFile();
    if (!payload) {
      return;
    }

    const sourceUrl = `local-file:${payload.id}:${payload.version}:${Date.now()}`;
    const item = catalogItemFromPayload(payload, sourceUrl, IMPORTED_SOURCE);
    const localPath = await saveInstalledBookPayload(payload.id, payload.version, payload);
    const installedBook: InstalledBook = {
      ...item,
      localPath,
      installedAt: Date.now(),
    };

    await addCustomBookSource(item);
    await upsertInstalledBook(installedBook);

    setCatalog((current) => [...current.filter((book) => book.id !== item.id), item].sort((a, b) => a.title.localeCompare(b.title)));
    setImportedBooks((current) => [...current.filter((book) => book.id !== item.id), installedBook]);
    setBookPayloads((current) => ({ ...current, [item.id]: payload }));

    if (!enabledBookIds.includes(item.id)) {
      const next = [...enabledBookIds, item.id];
      await saveEnabledBookIds(next);
      setEnabledBookIds(next);
    }
  }, [enabledBookIds]);

  const removeCustomSource = useCallback(async (bookId: string) => {
    const imported = importedBooks.find((book) => book.id === bookId);
    if (!imported) {
      return;
    }

    setError(null);
    try {
      await deleteInstalledBookPayload(imported.localPath);
      await removeInstalledBook(bookId);
      await removeCustomBookSource(bookId);

      setCatalog((current) => current.filter((book) => book.id !== bookId));
      setImportedBooks((current) => current.filter((book) => book.id !== bookId));
      setBookPayloads((current) => {
        const rest = { ...current };
        delete rest[bookId];
        return rest;
      });

      if (enabledBookIds.includes(bookId)) {
        const next = enabledBookIds.filter((id) => id !== bookId);
        await saveEnabledBookIds(next);
        setEnabledBookIds(next);
      }
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? `Could not remove "${imported.title}": ${removeError.message}`
          : `Could not remove "${imported.title}".`,
      );
    }
  }, [enabledBookIds, importedBooks]);

  const importedById = useMemo(() => {
    const map = new Map<string, InstalledBook>();
    for (const book of importedBooks) map.set(book.id, book);
    return map;
  }, [importedBooks]);

  const lookup = useCallback((query: string, filters: BookSearchFilters = {}): BookSearchResult[] => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const fuzzy = filters.fuzzy !== false;
    const allowedBookIds = filters.bookIds && filters.bookIds.length > 0 ? new Set(filters.bookIds) : null;

    const results: BookSearchResult[] = [];
    for (const book of catalog) {
      if (!enabledBookIds.includes(book.id)) continue;
      if (allowedBookIds && !allowedBookIds.has(book.id)) continue;
      if (filters.bookType && filters.bookType !== "all" && book.type !== filters.bookType) continue;

      const payload = bookPayloads[book.id];
      if (!payload) continue;

      const index = getBookIndex(payload);
      for (const match of matchBook(index, normalized, { fuzzy })) {
        const record = index.records[match.recordIndex];
        if (filters.inputLanguage && record.inputLanguage !== filters.inputLanguage) continue;
        if (filters.outputLanguage && record.outputLanguage !== filters.outputLanguage) continue;

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
  }, [bookPayloads, catalog, enabledBookIds]);

  return {
    catalog,
    importedById,
    enabledBookIds,
    loading,
    error,
    loadingBookIds,
    refresh,
    toggleBookEnabled,
    setBooksEnabled,
    importCustomSourceFromFile,
    removeCustomSource,
    lookup,
  };
}
