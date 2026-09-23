// Hook for search and filtering functionality

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Word, Translation } from '@/types';

export function useSearch<T extends Word | Translation>(items: T[]) {
  const [query, setQuery] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Filter items based on search criteria
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Text search
      if (debouncedQuery) {
        const searchLower = debouncedQuery.toLowerCase();
        if ('word' in item) {
          // Word search
          const matchesWord = item.word.toLowerCase().includes(searchLower);
          const matchesDefinition = item.definition.toLowerCase().includes(searchLower);
          if (!matchesWord && !matchesDefinition) return false;
        } else {
          // Translation search
          const matchesSource = item.sourceWord.toLowerCase().includes(searchLower);
          const matchesTarget = item.targetWord.toLowerCase().includes(searchLower);
          if (!matchesSource && !matchesTarget) return false;
        }
      }

      // Language filter
      if (selectedLanguages.length > 0) {
        if ('language' in item) {
          if (!selectedLanguages.includes(item.language)) return false;
        } else {
          const hasLanguage = selectedLanguages.includes(item.sourceLanguage) ||
                             selectedLanguages.includes(item.targetLanguage);
          if (!hasLanguage) return false;
        }
      }

      // Tag filter
      if (selectedTags.length > 0) {
        const hasTag = selectedTags.some(tag => (item.tags ?? []).includes(tag));
        if (!hasTag) return false;
      }

      return true;
    });
  }, [items, debouncedQuery, selectedLanguages, selectedTags]);

  // Toggle language filter
  const toggleLanguage = useCallback((language: string) => {
    setSelectedLanguages(prev =>
      prev.includes(language)
        ? prev.filter(l => l !== language)
        : [...prev, language]
    );
  }, []);

  // Toggle tag filter
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setQuery('');
    setSelectedLanguages([]);
    setSelectedTags([]);
  }, []);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return query.length > 0 || selectedLanguages.length > 0 || selectedTags.length > 0;
  }, [query, selectedLanguages, selectedTags]);

  return {
    query,
    setQuery,
    selectedLanguages,
    selectedTags,
    toggleLanguage,
    toggleTag,
    clearFilters,
    filteredItems,
    hasActiveFilters,
    resultCount: filteredItems.length,
  };
}
