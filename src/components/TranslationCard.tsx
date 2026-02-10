// TranslationCard component

import { useState } from 'react';
import { ArrowRight, Pencil, Trash2, Sparkles, Copy, Check } from 'lucide-react';
import type { Translation } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, getLanguageEmoji } from '@/utils/formatters';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface TranslationCardProps {
    translation: Translation;
    onEdit?: (translation: Translation) => void;
    onDelete?: (id: string) => void;
}

export function TranslationCard({ translation, onEdit, onDelete }: TranslationCardProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(
            `${translation.sourceWord} (${translation.sourceLanguage}) → ${translation.targetWord} (${translation.targetLanguage})`
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="glass rounded-xl p-6 hover-lift transition-smooth animate-slide-in-up group">
            {/* Translation Pair */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4 flex-1">
                    {/* Source */}
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{getLanguageEmoji(translation.sourceLanguage)}</span>
                        <div>
                            <p className="text-lg font-bold text-foreground">{translation.sourceWord}</p>
                            <Badge variant="glass" className="text-xs">
                                {translation.sourceLanguage}
                            </Badge>
                        </div>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="h-5 w-5 text-primary flex-shrink-0" />

                    {/* Target */}
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">{getLanguageEmoji(translation.targetLanguage)}</span>
                        <div>
                            <p className="text-lg font-bold text-foreground">{translation.targetWord}</p>
                            <Badge variant="glass" className="text-xs">
                                {translation.targetLanguage}
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleCopy}
                        className="h-8 w-8 hover:bg-primary/20"
                    >
                        {copied ? (
                            <Check className="h-4 w-4 text-green-400" />
                        ) : (
                            <Copy className="h-4 w-4" />
                        )}
                    </Button>

                    {onEdit && (
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onEdit(translation)}
                            className="h-8 w-8 hover:bg-primary/20"
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}

                    {onDelete && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 hover:bg-destructive/20"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="glass-strong">
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Translation?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to delete this translation? This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => onDelete(translation.id)}
                                        className="bg-destructive hover:bg-destructive/90"
                                    >
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </div>

            {/* Context */}
            {translation.context && (
                <div className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        Context
                    </p>
                    <p className="text-sm text-muted-foreground italic pl-3 border-l-2 border-primary/30">
                        {translation.context}
                    </p>
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
                <span>{formatDate(translation.dateAdded)}</span>
                {translation.aiGenerated && (
                    <div className="flex items-center gap-1 text-primary">
                        <Sparkles className="h-3 w-3" />
                        <span>AI Translated</span>
                    </div>
                )}
            </div>
        </div>
    );
}
