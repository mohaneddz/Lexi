// AddWordDialog component with AI features

import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Plus, X } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { useAI } from '@/hooks/useAI';
import { getSettings } from '@/utils/storage';
import { validateWord, validateDefinition, sanitizeInput } from '@/utils/validators';
import { useGroups } from '@/hooks/useGroups';

interface AddWordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdd: (word: {
        word: string;
        definition: string;
        language: string;
        tags: string[];
        aiGenerated: boolean;
        examples?: string[];
        groupIds?: string[];
    }) => Promise<unknown>;
}

export function AddWordDialog({ open, onOpenChange, onAdd }: AddWordDialogProps) {
    const [word, setWord] = useState('');
    const [definition, setDefinition] = useState('');
    const [language, setLanguage] = useState('English');
    const [defaultLanguage, setDefaultLanguage] = useState('English');
    const [tags, setTags] = useState<string[]>([]);
    const [examples, setExamples] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [aiGenerated, setAiGenerated] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<string>("");
    const [errors, setErrors] = useState<{ word?: string; definition?: string }>({});

    const { detectLanguage, defineWord, suggestTags, getExamples, suggestGroup, loading: aiLoading } = useAI();
    const { groups } = useGroups();

    useEffect(() => {
        if (!open) {
            return;
        }

        getSettings().then((settings) => {
            const fallbackLanguage = settings.defaultLanguage || 'English';
            setDefaultLanguage(fallbackLanguage);
            setLanguage(fallbackLanguage);
        });
    }, [open]);

    const handleAIDefine = async () => {
        if (!word.trim()) return;

        const languageResult = await detectLanguage(word);
        const detectedLanguage = languageResult.success ? languageResult.data : (language || defaultLanguage || 'English');

        if (languageResult.success) {
            setLanguage(languageResult.data);
        }

        const result = await defineWord(word, detectedLanguage);
        if (result.success) {
            setDefinition(result.data);
            setAiGenerated(true);

            // Auto-suggest tags
            const tagResult = await suggestTags(word, result.data);
            if (tagResult.success) {
                setTags(tagResult.data);
            }

            const exampleResult = await getExamples(word, detectedLanguage);
            if (exampleResult.success) {
                const cleanedExamples = Array.from(new Set(exampleResult.data.map((item) => sanitizeInput(item)).filter(Boolean))).slice(0, 5);
                setExamples(cleanedExamples);
            }

            // Auto-suggest group if groups are available
            if (groups.length > 0) {
                const groupResult = await suggestGroup(word, result.data, groups);
                if (groupResult.success && groupResult.data) {
                    setSelectedGroupId(groupResult.data);
                }
            }
        }
    };

    const handleAddTag = () => {
        const tag = sanitizeInput(tagInput);
        if (tag && !tags.includes(tag)) {
            setTags([...tags, tag]);
            setTagInput('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleSubmit = async () => {
        // Validate
        const wordValidation = validateWord(word);
        const defValidation = validateDefinition(definition);

        if (!wordValidation.valid || !defValidation.valid) {
            setErrors({
                word: wordValidation.error,
                definition: defValidation.error,
            });
            return;
        }

        setIsSubmitting(true);
        try {
            await onAdd({
                word: sanitizeInput(word),
                definition: sanitizeInput(definition),
                language: language || defaultLanguage || 'English',
                tags,
                aiGenerated,
                examples: examples.length > 0 ? examples : undefined,
                groupIds: selectedGroupId ? [selectedGroupId] : [],
            });

            // Reset form
            setWord('');
            setDefinition('');
            setLanguage(defaultLanguage || 'English');
            setTags([]);
            setExamples([]);
            setSelectedGroupId("");
            setAiGenerated(false);
            setErrors({});
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to add word:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="glass-strong max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Add New Word</DialogTitle>
                    <DialogDescription>
                        Add a new word to your vocabulary. Use AI to auto-generate definitions!
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Word Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Word</label>
                        <Input
                            value={word}
                            onChange={(e) => {
                                setWord(e.target.value);
                                setErrors({ ...errors, word: undefined });
                            }}
                            onKeyDown={(e) => {
                                if (e.ctrlKey && e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleAIDefine();
                                }
                            }}
                            placeholder="Enter a word..."
                            className="frost-input"
                        />
                        {errors.word && (
                            <p className="text-xs text-destructive">{errors.word}</p>
                        )}
                    </div>

                    {/* Language (Auto-detected) */}
                    {language && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Detected language:</span>
                            <Badge variant="glass">{language}</Badge>
                        </div>
                    )}

                    {/* Definition */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Definition</label>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleAIDefine}
                                disabled={!word.trim() || aiLoading}
                                className="gap-2 glass border-glass-border"
                            >
                                {aiLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Sparkles className="h-3 w-3" />
                                )}
                                AI Define
                            </Button>
                        </div>
                        <textarea
                            value={definition}
                            onChange={(e) => {
                                setDefinition(e.target.value);
                                setErrors({ ...errors, definition: undefined });
                            }}
                            onKeyDown={(e) => {
                                if (e.ctrlKey && e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleAIDefine();
                                }
                            }}
                            placeholder="Enter or generate definition..."
                            rows={4}
                            className="frost-input form-textarea"
                        />
                        {errors.definition && (
                            <p className="text-xs text-destructive">{errors.definition}</p>
                        )}
                    </div>

                    {examples.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium">Examples</p>
                            <div className="space-y-1.5 p-1">
                                {examples.map((example, index) => (
                                    <p key={`${example}-${index}`} className="text-sm text-muted-foreground">
                                        {example}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tags */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Tags</label>
                        <div className="flex gap-2">
                            <Input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                placeholder="Add tags..."
                                className="frost-input"
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={handleAddTag}
                                className="frost-input"
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {tags.map((tag) => (
                                    <Badge
                                        key={tag}
                                        variant="outline"
                                        className="cursor-pointer hover:bg-destructive/20 transition-colors"
                                        onClick={() => handleRemoveTag(tag)}
                                    >
                                        {tag}
                                        <X className="h-3 w-3 ml-1" />
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Group Selection */}
                    {groups.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Group</label>
                            <select
                                value={selectedGroupId}
                                onChange={(e) => setSelectedGroupId(e.target.value)}
                                className="frost-input form-select"
                            >
                                <option value="">No Group</option>
                                {groups.map((group) => (
                                    <option key={group.id} value={group.id}>{group.name}</option>
                                ))}
                            </select>
                            {selectedGroupId && aiGenerated && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Sparkles className="h-3 w-3" />
                                    AI suggested this group
                                </p>
                            )}
                        </div>
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
                        disabled={isSubmitting || !word.trim() || !definition.trim()}
                        className="bg-gradient-primary hover:opacity-90"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Adding...
                            </>
                        ) : (
                            'Add Word'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

