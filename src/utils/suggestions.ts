import type { Translation, Word } from "@/types";

export type DefinitionSuggestion = {
  id: string;
  word: string;
  definition: string;
  language: string;
  tags: string[];
};

export const DEFINITION_SUGGESTION_BANK: DefinitionSuggestion[] = [
  { id: "def-scrutinize", word: "Scrutinize", definition: "to examine closely and critically", language: "English", tags: ["analysis", "precision"] },
  { id: "def-concise", word: "Concise", definition: "expressing much in few words", language: "English", tags: ["communication", "writing"] },
  { id: "def-resilient", word: "Resilient", definition: "able to recover quickly from setbacks", language: "English", tags: ["mindset", "growth"] },
  { id: "def-nuance", word: "Nuance", definition: "a subtle difference in meaning or expression", language: "English", tags: ["language", "thinking"] },
  { id: "def-mettre-en-oeuvre", word: "Mettre en oeuvre", definition: "to put into effect or implement", language: "French", tags: ["action", "execution"] },
  { id: "def-sostenible", word: "Sostenible", definition: "able to continue over time without harm", language: "Spanish", tags: ["planning", "strategy"] },
  { id: "def-zielstrebig", word: "Zielstrebig", definition: "determined and focused toward goals", language: "German", tags: ["focus", "progress"] },
  { id: "def-seamless", word: "Seamless", definition: "smooth and without noticeable transitions", language: "English", tags: ["design", "quality"] },
];

export function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

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

export function shuffleArray<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function wordFingerprint(word: Pick<Word, "word" | "language">): string {
  return `${word.word.trim().toLowerCase()}::${word.language.trim().toLowerCase()}`;
}

export function translationFingerprint(translation: Pick<Translation, "sourceWord" | "sourceLanguage" | "targetWord" | "targetLanguage">): string {
  return [
    translation.sourceWord.trim().toLowerCase(),
    translation.sourceLanguage.trim().toLowerCase(),
    translation.targetWord.trim().toLowerCase(),
    translation.targetLanguage.trim().toLowerCase(),
  ].join("::");
}
