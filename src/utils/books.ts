import { open } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, exists, mkdir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import type { BookCatalogItem, BookPayload, BookType, DictionaryBookPayload, TranslationBookPayload } from "@/types";

const CATALOG_PATH = "/books/catalog.json";
const BOOKS_ROOT_DIR = "books";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isDictionaryPayload(value: unknown): value is DictionaryBookPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    payload.type === "dictionary" &&
    typeof payload.id === "string" &&
    typeof payload.title === "string" &&
    typeof payload.version === "string" &&
    Array.isArray(payload.entries)
  );
}

function isTranslationPayload(value: unknown): value is TranslationBookPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    payload.type === "translation" &&
    typeof payload.id === "string" &&
    typeof payload.title === "string" &&
    typeof payload.version === "string" &&
    Array.isArray(payload.entries)
  );
}

function isBookPayload(value: unknown): value is BookPayload {
  return isDictionaryPayload(value) || isTranslationPayload(value);
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function loadStarterCatalog(): Promise<BookCatalogItem[]> {
  const response = await fetch(CATALOG_PATH);
  if (!response.ok) {
    throw new Error("Failed to load books catalog.");
  }

  const body = await response.json();
  if (!Array.isArray(body)) {
    return [];
  }

  return body
    .filter((item): item is BookCatalogItem => item && typeof item.id === "string" && typeof item.sourceUrl === "string")
    .map((item) => ({
      ...item,
      inputLanguages: asStringArray(item.inputLanguages),
      outputLanguages: asStringArray(item.outputLanguages),
      sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : 0,
    }));
}

export async function downloadBookPayload(url: string): Promise<BookPayload> {
  const response = await tauriFetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}).`);
  }

  const text = await response.text();
  const parsed = JSON.parse(text) as unknown;
  if (!isBookPayload(parsed)) {
    throw new Error("Invalid book payload.");
  }

  return parsed;
}

export async function loadPayloadFromSourceUrl(url: string): Promise<BookPayload> {
  if (url.startsWith("/")) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to read bundled payload at ${url}`);
    }
    const parsed = (await response.json()) as unknown;
    if (!isBookPayload(parsed)) {
      throw new Error("Invalid bundled payload.");
    }
    return parsed;
  }

  return downloadBookPayload(url);
}

export async function importBookPayloadFromFile(): Promise<BookPayload | null> {
  const selected = await open({
    title: "Import book payload",
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (!selected || Array.isArray(selected)) {
    return null;
  }

  const text = await readTextFile(selected);
  const parsed = JSON.parse(text) as unknown;
  if (!isBookPayload(parsed)) {
    throw new Error("Invalid JSON payload.");
  }

  return parsed;
}

export function catalogItemFromPayload(payload: BookPayload, sourceUrl: string, source: string): BookCatalogItem {
  return {
    id: payload.id,
    title: payload.title,
    type: payload.type as BookType,
    version: payload.version,
    description: payload.description,
    source,
    sourceUrl,
    coverUrl: payload.coverUrl,
    inputLanguages: payload.inputLanguages,
    outputLanguages: payload.outputLanguages,
    sizeBytes: JSON.stringify(payload).length,
  };
}

function payloadFilePath(bookId: string, version: string): string {
  return `${BOOKS_ROOT_DIR}/${bookId}/${version}.json`;
}

export async function saveInstalledBookPayload(bookId: string, version: string, payload: BookPayload): Promise<string> {
  const dir = `${BOOKS_ROOT_DIR}/${bookId}`;
  if (!(await exists(dir, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
  }

  const localPath = payloadFilePath(bookId, version);
  await writeTextFile(localPath, JSON.stringify(payload), { baseDir: BaseDirectory.AppData });
  return localPath;
}

export async function readInstalledBookPayload(localPath: string): Promise<BookPayload> {
  const text = await readTextFile(localPath, { baseDir: BaseDirectory.AppData });
  const parsed = JSON.parse(text) as unknown;
  if (!isBookPayload(parsed)) {
    throw new Error(`Invalid payload in ${localPath}`);
  }
  return parsed;
}

export async function deleteInstalledBookPayload(localPath: string): Promise<void> {
  const pathParts = localPath.split("/");
  if (pathParts.length < 2) {
    return;
  }

  const dir = pathParts.slice(0, pathParts.length - 1).join("/");
  if (await exists(localPath, { baseDir: BaseDirectory.AppData })) {
    await remove(localPath, { baseDir: BaseDirectory.AppData });
  }
  if (await exists(dir, { baseDir: BaseDirectory.AppData })) {
    await remove(dir, { baseDir: BaseDirectory.AppData, recursive: true });
  }
}

export async function verifyChecksum(payload: BookPayload, checksum?: string): Promise<void> {
  if (!checksum) {
    return;
  }

  const actual = await sha256(JSON.stringify(payload));
  if (actual !== checksum.toLowerCase()) {
    throw new Error("Checksum mismatch for downloaded book.");
  }
}
