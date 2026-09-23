// Hook for managing words with Tauri store

import { useState, useEffect, useCallback } from 'react';
import type { Word } from '@/types';
import * as storage from '@/utils/storage';
import { announceDataChanged, onDataChanged } from '@/utils/dataEvents';

function capitalizeLeadingCharacter(value: string): string {
  return value.replace(/^(\s*)(\S)/, (_match, ws: string, first: string) => `${ws}${first.toUpperCase()}`);
}

export function useWords() {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load words from storage
  const loadWords = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true);
      const loadedWords = await storage.getWords();
      setWords(loadedWords);
      setError(null);
    } catch (err) {
      setError('Failed to load words');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadWords();
  }, [loadWords]);

  // Another page or the quick-capture window changed the store.
  useEffect(() => onDataChanged('words', () => { void loadWords({ silent: true }); }), [loadWords]);

  // Add a new word
  const addWord = useCallback(async (word: Omit<Word, 'id' | 'dateAdded'>) => {
    try {
            const newWord: Word = {
                ...word,
                word: capitalizeLeadingCharacter(word.word),
                id: crypto.randomUUID(),
                dateAdded: Date.now(),
                favorite: Boolean(word.favorite),
                groupIds: word.groupIds || [],
            };
      await storage.addWord(newWord);
      announceDataChanged('words');
      setWords(prev => [...prev, newWord]);
      return newWord;
    } catch (err) {
      setError('Failed to add word');
      console.error(err);
      throw err;
    }
  }, []);

  // Update an existing word
  const updateWord = useCallback(async (id: string, updates: Partial<Word>) => {
    try {
      await storage.updateWord(id, updates);
      announceDataChanged('words');
      setWords(prev =>
        prev.map(w => (
          w.id === id
            ? {
                ...w,
                ...updates,
                ...(typeof updates.word === "string" ? { word: capitalizeLeadingCharacter(updates.word) } : {}),
              }
            : w
        ))
      );
    } catch (err) {
      setError('Failed to update word');
      console.error(err);
      throw err;
    }
  }, []);

  // Delete a word
  const deleteWord = useCallback(async (id: string) => {
    try {
      await storage.deleteWord(id);
      announceDataChanged('words');
      setWords(prev => prev.filter(w => w.id !== id));
    } catch (err) {
      setError('Failed to delete word');
      console.error(err);
      throw err;
    }
  }, []);

  // Get word by ID
  const getWordById = useCallback((id: string) => {
    return words.find(w => w.id === id);
  }, [words]);

  // Get words by language
  const getWordsByLanguage = useCallback((language: string) => {
    return words.filter(w => w.language === language);
  }, [words]);

  // Get words by tag
  const getWordsByTag = useCallback((tag: string) => {
    return words.filter(w => w.tags.includes(tag));
  }, [words]);

  // Get all unique languages
  const getLanguages = useCallback(() => {
    const languages = new Set(words.map(w => w.language));
    return Array.from(languages);
  }, [words]);

  // Get all unique tags
  const getTags = useCallback(() => {
    const tags = new Set(words.flatMap(w => w.tags));
    return Array.from(tags);
  }, [words]);

  return {
    words,
    loading,
    error,
    addWord,
    updateWord,
    deleteWord,
    getWordById,
    getWordsByLanguage,
    getWordsByTag,
    getLanguages,
    getTags,
    refresh: loadWords,
  };
}
