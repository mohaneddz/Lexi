import type { Translation } from "@/types";

export function parseJsonArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function translationFingerprint(translation: Pick<Translation, "sourceWord" | "sourceLanguage" | "targetWord" | "targetLanguage">): string {
  return [
    translation.sourceWord.trim().toLowerCase(),
    translation.sourceLanguage.trim().toLowerCase(),
    translation.targetWord.trim().toLowerCase(),
    translation.targetLanguage.trim().toLowerCase(),
  ].join("::");
}
