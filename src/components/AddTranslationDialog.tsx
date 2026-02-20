// AddTranslationDialog component with AI translation

import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Languages as LanguagesIcon } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAI } from '@/hooks/useAI';
import { useWords } from '@/hooks/useWords';
import { getSettings, updateSettings } from '@/utils/storage';
import { sanitizeInput, validateDefinition, validateWord } from '@/utils/validators';

interface AddTranslationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdd: (translation: {
        sourceWord: string;
        targetWord: string;
        sourceLanguage: string;
        targetLanguage: string;
        context?: string;
        aiGenerated: boolean;
    }) => Promise<unknown>;
}

const LANGUAGES = [
    'English', 'French', 'Spanish', 'German', 'Italian', 'Portuguese',
    'Russian', 'Japanese', 'Korean', 'Chinese', 'Arabic', 'Hindi',
];

export function AddTranslationDialog({ open, onOpenChange, onAdd }: AddTranslationDialogProps) {
    const [mode, setMode] = useState<'translation' | 'definition'>('translation');

    const [sourceWord, setSourceWord] = useState('');
    const [targetWord, setTargetWord] = useState('');
    const [sourceLang, setSourceLang] = useState('English');
    const [targetLang, setTargetLang] = useState('English');

    const [definitionWord, setDefinitionWord] = useState('');
    const [definitionText, setDefinitionText] = useState('');
    const [definitionLanguage, setDefinitionLanguage] = useState('English');

    const [defaultLanguage, setDefaultLanguage] = useState('English');
    const [context, setContext] = useState('');
    const [aiGenerated, setAiGenerated] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { translate, loading: aiLoading } = useAI();
    const { addWord } = useWords();

    useEffect(() => {
        if (!open) {
            return;
        }

        getSettings().then((settings) => {
            const fallbackLanguage = settings.defaultLanguage || 'English';
            const fallbackDefinitionLanguage = settings.defaultDefinitionLanguage || fallbackLanguage;
            const fallbackSourceLanguage = settings.defaultTranslationSourceLanguage || fallbackLanguage;
            const fallbackTargetLanguage = settings.defaultTranslationTargetLanguage || fallbackLanguage;
            setDefaultLanguage(fallbackLanguage);
            setSourceLang(fallbackSourceLanguage);
            setTargetLang(fallbackTargetLanguage);
            setDefinitionLanguage(fallbackDefinitionLanguage);
        });
    }, [open]);

    const handleAITranslate = async () => {
        if (!sourceWord.trim()) return;

        const result = await translate(sourceWord, sourceLang, targetLang);
        if (result.success) {
            setTargetWord(result.data);
            setAiGenerated(true);
            await updateSettings({
                defaultTranslationSourceLanguage: sourceLang,
                defaultTranslationTargetLanguage: targetLang,
            });
        }
    };

    const handleSubmit = async () => {
        if (mode === 'definition') {
            const wordValidation = validateWord(definitionWord);
            const definitionValidation = validateDefinition(definitionText);
            if (!wordValidation.valid || !definitionValidation.valid) {
                return;
            }

            setIsSubmitting(true);
            try {
                await addWord({
                    word: sanitizeInput(definitionWord),
                    definition: sanitizeInput(definitionText),
                    language: definitionLanguage || defaultLanguage || 'English',
                    tags: [],
                    aiGenerated: false,
                    groupIds: [],
                });
                await updateSettings({ defaultDefinitionLanguage: definitionLanguage || defaultLanguage || 'English' });

                setDefinitionWord('');
                setDefinitionText('');
                setDefinitionLanguage(defaultLanguage || 'English');
                onOpenChange(false);
            } catch (error) {
                console.error('Failed to add definition:', error);
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (!sourceWord.trim() || !targetWord.trim()) return;

        setIsSubmitting(true);
        try {
            await onAdd({
                sourceWord: sanitizeInput(sourceWord),
                targetWord: sanitizeInput(targetWord),
                sourceLanguage: sourceLang,
                targetLanguage: targetLang,
                context: context.trim() ? sanitizeInput(context) : undefined,
                aiGenerated,
            });
            await updateSettings({
                defaultTranslationSourceLanguage: sourceLang,
                defaultTranslationTargetLanguage: targetLang,
            });

            // Reset form
            setSourceWord('');
            setTargetWord('');
            setTargetLang(defaultLanguage || 'English');
            setContext('');
            setAiGenerated(false);
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to add translation:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="glass-strong max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl flex items-center gap-2">
                        <LanguagesIcon className="h-6 w-6" />
                        {mode === 'translation' ? 'Add New Translation' : 'Add New Definition'}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'translation'
                            ? 'Add a translation pair. Use AI to auto-translate!'
                            : 'Capture a new word definition quickly.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                    <div className="inline-flex items-center gap-1 rounded-lg border border-white/14 bg-white/5 p-1">
                        <button
                            type="button"
                            className={`rounded-md px-2.5 py-1 text-xs transition ${mode === 'definition' ? 'bg-white/18 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setMode('definition')}
                        >
                            Definition
                        </button>
                        <button
                            type="button"
                            className={`rounded-md px-2.5 py-1 text-xs transition ${mode === 'translation' ? 'bg-white/18 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setMode('translation')}
                        >
                            Translation
                        </button>
                    </div>

                    {mode === 'translation' ? (
                        <>
                            {/* Source Word */}
                            <div className="space-y-2">
                                <div className="text-sm font-medium">Source Word</div>
                                <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3">
                                    <Select value={sourceLang} onValueChange={setSourceLang}>
                                        <SelectTrigger className="frost-select form-select w-44 shrink-0">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="glass-strong">
                                            {LANGUAGES.map((lang) => (
                                                <SelectItem key={lang} value={lang}>
                                                    {lang}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={sourceWord}
                                        onChange={(e) => setSourceWord(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                void handleAITranslate();
                                            }
                                        }}
                                        placeholder="Enter source word..."
                                        className="frost-input flex-1 min-w-0"
                                    />
                                </div>
                            </div>

                            {/* AI Translate Button */}
                            <div className="flex justify-center">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleAITranslate}
                                    disabled={!sourceWord.trim() || aiLoading}
                                    className="gap-2 glass border-glass-border"
                                >
                                    {aiLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4" />
                                    )}
                                    AI Translate
                                </Button>
                            </div>

                            {/* Target Word */}
                            <div className="space-y-2">
                                <div className="text-sm font-medium">Target Word</div>
                                <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-3">
                                    <Select value={targetLang} onValueChange={setTargetLang}>
                                        <SelectTrigger className="frost-select form-select w-44 shrink-0">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="glass-strong">
                                            {LANGUAGES.map((lang) => (
                                                <SelectItem key={lang} value={lang}>
                                                    {lang}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={targetWord}
                                        onChange={(e) => setTargetWord(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.ctrlKey && e.key === 'Enter') {
                                                e.preventDefault();
                                                void handleSubmit();
                                            }
                                        }}
                                        placeholder="Enter or generate translation..."
                                        className="frost-input flex-1 min-w-0"
                                    />
                                </div>
                            </div>

                            {/* Context (Optional) */}
                            <div className="space-y-2">
                                <div className="text-sm font-medium">Context (Optional)</div>
                                <textarea
                                    value={context}
                                    onChange={(e) => setContext(e.target.value)}
                                    placeholder="Add context or example usage..."
                                    rows={3}
                                    className="frost-input form-textarea"
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <div className="text-sm font-medium">Word</div>
                                <Input
                                    value={definitionWord}
                                    onChange={(e) => setDefinitionWord(e.target.value)}
                                    placeholder="Enter word..."
                                    className="frost-input"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="text-sm font-medium">Language</div>
                                <Select value={definitionLanguage} onValueChange={setDefinitionLanguage}>
                                    <SelectTrigger className="frost-select form-select w-44">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="glass-strong">
                                        {LANGUAGES.map((lang) => (
                                            <SelectItem key={lang} value={lang}>
                                                {lang}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <div className="text-sm font-medium">Definition</div>
                                <textarea
                                    value={definitionText}
                                    onChange={(e) => setDefinitionText(e.target.value)}
                                    placeholder="Enter definition..."
                                    rows={4}
                                    className="frost-input form-textarea"
                                />
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={
                            isSubmitting ||
                            (mode === 'translation'
                                ? (!sourceWord.trim() || !targetWord.trim())
                                : (!definitionWord.trim() || !definitionText.trim()))
                        }
                        className="bg-gradient-primary hover:opacity-90"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Adding...
                            </>
                        ) : (
                            mode === 'translation' ? 'Add Translation' : 'Add Definition'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

