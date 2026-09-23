// WordCard component with glassmorphism design

import { useState } from 'react';
import { Pencil, Trash2, Sparkles, Copy, Check } from 'lucide-react';
import type { Word } from '@/types';
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

interface WordCardProps {
  word: Word;
  onEdit?: (word: Word) => void;
  onDelete?: (id: string) => void;
}

export function WordCard({ word, onEdit, onDelete }: WordCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(word.definition);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass rounded-xl p-6 hover-lift transition-smooth animate-slide-in-up group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{getLanguageEmoji(word.language)}</span>
          <div>
            <h3 className="text-xl font-bold text-foreground">{word.word}</h3>
            <Badge variant="glass" className="mt-1">
              {word.language}
            </Badge>
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
              onClick={() => onEdit(word)}
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
                  <AlertDialogTitle>Delete Word?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{word.word}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(word.id)}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Definition */}
      <p className="text-muted-foreground mb-4 leading-relaxed">
        {word.definition}
      </p>

      {/* Tags */}
      {word.tags && word.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {word.tags.map((tag, index) => (
            <Badge key={index} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Examples */}
      {word.examples && word.examples.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Examples
          </p>
          {word.examples.map((example, index) => (
            <p key={index} className="text-sm text-muted-foreground italic pl-3 border-l-2 border-primary/30">
              {example}
            </p>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
        <span>{formatDate(word.dateAdded)}</span>
        {word.aiGenerated && (
          <div className="flex items-center gap-1 text-primary">
            <Sparkles className="h-3 w-3" />
            <span>AI Generated</span>
          </div>
        )}
      </div>
    </div>
  );
}
