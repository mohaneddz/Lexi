// Hook for managing translations with Tauri store

import { useState, useEffect, useCallback } from 'react';
import type { Translation } from '@/types';
import * as storage from '@/utils/storage';

function capitalizeLeadingCharacter(value: string): string {
    return value.replace(/^(\s*)(\S)/, (_match, ws: string, first: string) => `${ws}${first.toUpperCase()}`);
}

export function useTranslations() {
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load translations from storage
    const loadTranslations = useCallback(async () => {
        try {
            setLoading(true);
            const loadedTranslations = await storage.getTranslations();
            setTranslations(loadedTranslations);
            setError(null);
        } catch (err) {
            setError('Failed to load translations');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        loadTranslations();
    }, [loadTranslations]);

    // Add a new translation
    const addTranslation = useCallback(async (
        translation: Omit<Translation, 'id' | 'dateAdded'>
    ) => {
        try {
            const newTranslation: Translation = {
                ...translation,
                sourceWord: capitalizeLeadingCharacter(translation.sourceWord),
                targetWord: capitalizeLeadingCharacter(translation.targetWord),
                id: crypto.randomUUID(),
                dateAdded: Date.now(),
                groupIds: translation.groupIds || [],
            };
            await storage.addTranslation(newTranslation);
            setTranslations(prev => [...prev, newTranslation]);
            return newTranslation;
        } catch (err) {
            setError('Failed to add translation');
            console.error(err);
            throw err;
        }
    }, []);

    // Update an existing translation
    const updateTranslation = useCallback(async (
        id: string,
        updates: Partial<Translation>
    ) => {
        try {
            await storage.updateTranslation(id, updates);
            setTranslations(prev =>
                prev.map(t => (
                    t.id === id
                        ? {
                            ...t,
                            ...updates,
                            ...(typeof updates.sourceWord === "string" ? { sourceWord: capitalizeLeadingCharacter(updates.sourceWord) } : {}),
                            ...(typeof updates.targetWord === "string" ? { targetWord: capitalizeLeadingCharacter(updates.targetWord) } : {}),
                        }
                        : t
                ))
            );
        } catch (err) {
            setError('Failed to update translation');
            console.error(err);
            throw err;
        }
    }, []);

    // Delete a translation
    const deleteTranslation = useCallback(async (id: string) => {
        try {
            await storage.deleteTranslation(id);
            setTranslations(prev => prev.filter(t => t.id !== id));
        } catch (err) {
            setError('Failed to delete translation');
            console.error(err);
            throw err;
        }
    }, []);

    // Get translation by ID
    const getTranslationById = useCallback((id: string) => {
        return translations.find(t => t.id === id);
    }, [translations]);

    // Get translations by language pair
    const getTranslationsByLanguagePair = useCallback((
        sourceLang: string,
        targetLang: string
    ) => {
        return translations.filter(
            t => t.sourceLanguage === sourceLang && t.targetLanguage === targetLang
        );
    }, [translations]);

    // Get all unique language pairs
    const getLanguagePairs = useCallback(() => {
        const pairs = new Set(
            translations.map(t => `${t.sourceLanguage}-${t.targetLanguage}`)
        );
        return Array.from(pairs);
    }, [translations]);

    return {
        translations,
        loading,
        error,
        addTranslation,
        updateTranslation,
        deleteTranslation,
        getTranslationById,
        getTranslationsByLanguagePair,
        getLanguagePairs,
        refresh: loadTranslations,
    };
}
