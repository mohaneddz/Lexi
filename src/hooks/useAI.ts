import { useCallback, useState } from "react";

import type { AIResponse } from "@/types";
import * as aiService from "@/utils/ai-service";

type ServiceCall<T> = () => Promise<AIResponse<T>>;

export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCall = useCallback(async <T,>(
    call: ServiceCall<T>,
    fallbackData: T,
  ): Promise<AIResponse<T>> => {
    setLoading(true);
    setError(null);

    try {
      const result = await call();

      if (!result.success && result.error) {
        setError(result.error);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected AI failure";
      setError(message);
      return {
        success: false,
        data: fallbackData,
        error: message,
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const detectLanguage = useCallback(
    async (text: string) => runCall(() => aiService.detectLanguage(text), ""),
    [runCall],
  );

  const defineWord = useCallback(
    async (word: string, language: string) =>
      runCall(() => aiService.defineWord(word, language), ""),
    [runCall],
  );

  const translate = useCallback(
    async (text: string, sourceLang: string, targetLang: string) =>
      runCall(() => aiService.translateText(text, sourceLang, targetLang), ""),
    [runCall],
  );

  const suggestTags = useCallback(
    async (word: string, definition: string) =>
      runCall(() => aiService.suggestTags(word, definition), []),
    [runCall],
  );

  const getExamples = useCallback(
    async (word: string, language: string) =>
      runCall(() => aiService.getExamples(word, language), []),
    [runCall],
  );

  const testConnection = useCallback(
    async (apiKey?: string, model?: string) =>
      runCall(() => aiService.testAiConnectionWithConfig({ apiKey, model }), ""),
    [runCall],
  );

  const suggestGroup = useCallback(
    async (word: string, definition: string, availableGroups: Array<{ id: string; name: string; description?: string }>) =>
      runCall(() => aiService.suggestGroup(word, definition, availableGroups), ""),
    [runCall],
  );

  const suggestGroupsBatch = useCallback(
    async (items: aiService.GroupBatchItem[], availableGroups: Array<{ id: string; name: string; description?: string }>) =>
      runCall(() => aiService.suggestGroupsBatch(items, availableGroups), []),
    [runCall],
  );

  const suggestTagsBatch = useCallback(
    async (items: aiService.TagBatchItem[], knownTags: string[]) =>
      runCall(() => aiService.suggestTagsBatch(items, knownTags), []),
    [runCall],
  );

  const captureWithMeta = useCallback(
    async (request: aiService.CaptureMetaRequest) =>
      runCall(() => aiService.captureWithMeta(request), { output: "", tags: [], groupId: null }),
    [runCall],
  );

  const suggestGroupIcon = useCallback(
    async (groupName: string, groupDescription: string | undefined, availableIconNames: string[]) =>
      runCall(() => aiService.suggestGroupIcon(groupName, groupDescription, availableIconNames), ""),
    [runCall],
  );

  const suggestDistractorDefinitions = useCallback(
    async (word: string, definition: string, language: string) =>
      runCall(() => aiService.suggestDistractorDefinitions(word, definition, language), []),
    [runCall],
  );

  const suggestRelatedTranslations = useCallback(
    async (sourceWord: string, sourceLanguage: string, targetLanguage: string, context: string | undefined, excludeWords: string[], count?: number) =>
      runCall(() => aiService.suggestRelatedTranslations(sourceWord, sourceLanguage, targetLanguage, context, excludeWords, count), []),
    [runCall],
  );

  const suggestRelatedWords = useCallback(
    async (word: string, language: string, definition: string, excludeWords: string[], count?: number) =>
      runCall(() => aiService.suggestRelatedWords(word, language, definition, excludeWords, count), []),
    [runCall],
  );

  const suggestGroupWords = useCallback(
    async (request: aiService.GroupWordSuggestionRequest) =>
      runCall(() => aiService.suggestGroupWords(request), []),
    [runCall],
  );

  return {
    loading,
    error,
    detectLanguage,
    defineWord,
    translate,
    suggestTags,
    getExamples,
    testConnection,
    suggestGroup,
    suggestGroupsBatch,
    suggestTagsBatch,
    captureWithMeta,
    suggestGroupIcon,
    suggestDistractorDefinitions,
    suggestRelatedTranslations,
    suggestRelatedWords,
    suggestGroupWords,
  };
}
