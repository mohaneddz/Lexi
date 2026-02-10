// Validation utilities

export function isValidLanguageCode(code: string): boolean {
    // ISO 639-1 language codes (simplified list)
    const validCodes = [
        'en', 'fr', 'es', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
        'ar', 'hi', 'nl', 'sv', 'no', 'da', 'fi', 'pl', 'tr', 'el',
    ];
    return validCodes.includes(code.toLowerCase());
}

export function validateWord(word: string): { valid: boolean; error?: string } {
    if (!word || word.trim().length === 0) {
        return { valid: false, error: 'Word cannot be empty' };
    }
    if (word.length > 100) {
        return { valid: false, error: 'Word is too long (max 100 characters)' };
    }
    return { valid: true };
}

export function validateDefinition(definition: string): { valid: boolean; error?: string } {
    if (!definition || definition.trim().length === 0) {
        return { valid: false, error: 'Definition cannot be empty' };
    }
    if (definition.length > 1000) {
        return { valid: false, error: 'Definition is too long (max 1000 characters)' };
    }
    return { valid: true };
}

export function validateLanguage(language: string): { valid: boolean; error?: string } {
    if (!language || language.trim().length === 0) {
        return { valid: false, error: 'Language cannot be empty' };
    }
    return { valid: true };
}

export function sanitizeInput(input: string): string {
    return input.trim().replace(/\s+/g, ' ');
}

export function validateTags(tags: string[]): { valid: boolean; error?: string } {
    if (tags.length > 20) {
        return { valid: false, error: 'Too many tags (max 20)' };
    }
    for (const tag of tags) {
        if (tag.length > 30) {
            return { valid: false, error: 'Tag is too long (max 30 characters)' };
        }
    }
    return { valid: true };
}

export function validateGroqApiKey(apiKey: string): { valid: boolean; error?: string } {
    const trimmed = apiKey.trim();
    if (!trimmed) {
        return { valid: true };
    }

    if (!/^gsk_[A-Za-z0-9]{20,}$/.test(trimmed)) {
        return { valid: false, error: 'Invalid GROQ API key format (expected gsk_...)' };
    }

    return { valid: true };
}

export function validateGroqModel(model: string): { valid: boolean; error?: string } {
    if (!model.trim()) {
        return { valid: false, error: 'Model is required' };
    }

    return { valid: true };
}
