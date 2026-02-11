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
import { getSettings } from '@/utils/storage';
import { sanitizeInput } from '@/utils/validators';

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
    const [sourceWord, setSourceWord] = useState('');
    const [targetWord, setTargetWord] = useState('');
    const [sourceLang, setSourceLang] = useState('English');
    const [targetLang, setTargetLang] = useState('English');
    const [defaultLanguage, setDefaultLanguage] = useState('English');
    const [context, setContext] = useState('');
    const [aiGenerated, setAiGenerated] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { translate, loading: aiLoading } = useAI();

    useEffect(() => {
        if (!open) {
            return;
        }

        getSettings().then((settings) => {
            const fallbackLanguage = settings.defaultLanguage || 'English';
            setDefaultLanguage(fallbackLanguage);
            setTargetLang(fallbackLanguage);
        });
    }, [open]);

    const handleAITranslate = async () => {
        if (!sourceWord.trim()) return;

        const result = await translate(sourceWord, sourceLang, targetLang);
        if (result.success) {
            setTargetWord(result.data);
            setAiGenerated(true);
        }
    };

    const handleSubmit = async () => {
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
                        Add New Translation
                    </DialogTitle>
                    <DialogDescription>
                        Add a translation pair. Use AI to auto-translate!
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Source Word */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Source Word</label>
                        <div className="flex gap-2">
                            <Select value={sourceLang} onValueChange={setSourceLang}>
                                <SelectTrigger className="w-[140px] frost-input form-select">
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
                                    if (e.ctrlKey && e.key === 'Enter') {
                                        e.preventDefault();
                                        void handleAITranslate();
                                    }
                                }}
                                placeholder="Enter source word..."
                                className="frost-input flex-1"
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
                        <label className="text-sm font-medium">Target Word</label>
                        <div className="flex gap-2">
                            <Select value={targetLang} onValueChange={setTargetLang}>
                                <SelectTrigger className="w-[140px] frost-input form-select">
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
                                className="frost-input flex-1"
                            />
                        </div>
                    </div>

                    {/* Context (Optional) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Context (Optional)</label>
                        <textarea
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="Add context or example usage..."
                            rows={3}
                            className="frost-input form-textarea"
                        />
                    </div>
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
                        disabled={isSubmitting || !sourceWord.trim() || !targetWord.trim()}
                        className="bg-gradient-primary hover:opacity-90"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Adding...
                            </>
                        ) : (
                            'Add Translation'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

