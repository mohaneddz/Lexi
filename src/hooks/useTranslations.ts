// Hook for managing translations with Tauri store

import { useState, useEffect, useCallback } from 'react';
import type { Translation } from '@/types';
import * as storage from '@/utils/storage';
import { announceDataChanged, onDataChanged } from '@/utils/dataEvents';

function capitalizeLeadingCharacter(value: string): string {
    return value.replace(/^(\s*)(\S)/, (_match, ws: string, first: string) => `${ws}${first.toUpperCase()}`);
}

export function useTranslations() {
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load translations from storage
    const loadTranslations = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        try {
            if (!silent) setLoading(true);
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

    // Another page or the quick-capture window changed the store.
    useEffect(() => onDataChanged('translations', () => { void loadTranslations({ silent: true }); }), [loadTranslations]);

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
                favorite: Boolean(translation.favorite),
                groupIds: translation.groupIds || [],
            };
            await storage.addTranslation(newTranslation);
            announceDataChanged('translations');
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
            announceDataChanged('translations');
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

    // Update many translations with a single store write
    const updateTranslations = useCallback(async (changes: Record<string, Partial<Translation>>) => {
        try {
            await storage.updateTranslationsBulk(changes);
            announceDataChanged('translations');
            setTranslations(prev => prev.map(t => (changes[t.id] ? { ...t, ...changes[t.id] } : t)));
        } catch (err) {
            setError('Failed to update translations');
            console.error(err);
            throw err;
        }
    }, []);

    // Delete a translation
    const deleteTranslation = useCallback(async (id: string) => {
        try {
            await storage.deleteTranslation(id);
            announceDataChanged('translations');
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
        updateTranslations,
        deleteTranslation,
        getTranslationById,
        getTranslationsByLanguagePair,
        getLanguagePairs,
        refresh: loadTranslations,
    };
}
