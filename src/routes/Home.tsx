import { useState, useMemo } from 'react';
import { Plus, BookOpen, Languages, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatsWidget } from '@/components/StatsWidget';
import { WordCard } from '@/components/WordCard';
import { TranslationCard } from '@/components/TranslationCard';
import { AddWordDialog } from '@/components/AddWordDialog';
import { AddTranslationDialog } from '@/components/AddTranslationDialog';
import { EmptyState } from '@/components/EmptyState';
import { useWords } from '@/hooks/useWords';
import { useTranslations } from '@/hooks/useTranslations';
import type { AppStats } from '@/types';

export default function Home() {
  const [addWordOpen, setAddWordOpen] = useState(false);
  const [addTranslationOpen, setAddTranslationOpen] = useState(false);

  const { words, addWord, loading: wordsLoading } = useWords();
  const { translations, addTranslation, loading: translationsLoading } = useTranslations();

  // Calculate stats
  const stats: AppStats = useMemo(() => {
    const languageSet = new Set(words.map(w => w.language));
    const recentWords = [...words]
      .sort((a, b) => b.dateAdded - a.dateAdded)
      .slice(0, 5);
    const recentTranslations = [...translations]
      .sort((a, b) => b.dateAdded - a.dateAdded)
      .slice(0, 5);

    const languageStats = Array.from(languageSet).map(lang => ({
      language: lang,
      languageCode: lang.toLowerCase().slice(0, 2),
      wordCount: words.filter(w => w.language === lang).length,
      translationCount: translations.filter(
        t => t.sourceLanguage === lang || t.targetLanguage === lang
      ).length,
      lastAdded: Math.max(
        ...words.filter(w => w.language === lang).map(w => w.dateAdded),
        0
      ),
    }));

    return {
      totalWords: words.length,
      totalTranslations: translations.length,
      languagesTracked: languageSet.size,
      recentWords,
      recentTranslations,
      languageStats,
    };
  }, [words, translations]);

  const loading = wordsLoading || translationsLoading;

  const handleAddWord = async (word: any) => {
    await addWord(word);
  };

  const handleAddTranslation = async (translation: any) => {
    await addTranslation(translation);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary via-purple-400 to-blue-400 bg-clip-text text-transparent">
              Welcome to Lexi
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Your AI-powered vocabulary companion
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setAddWordOpen(true)}
            className="bg-gradient-primary text-white shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:opacity-90 transition-all gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Word
          </Button>
          <Button
            onClick={() => setAddTranslationOpen(true)}
            variant="outline"
            className="border-border/50 hover:bg-accent/50 gap-2"
          >
            <Languages className="h-4 w-4" />
            Add Translation
          </Button>
        </div>
      </header>

      {/* Stats */}
      <StatsWidget stats={stats} />

      {/* Recent Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Words Card */}
        <section className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">Recent Words</h2>
          </div>
          
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : stats.recentWords.length > 0 ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
              {stats.recentWords.map((word) => (
                <WordCard key={word.id} word={word} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No words yet"
              description="Start building your vocabulary by adding your first word!"
              actionLabel="Add Word"
              onAction={() => setAddWordOpen(true)}
              icon={<BookOpen className="h-10 w-10 text-primary" />}
            />
          )}
        </section>

        {/* Recent Translations Card */}
        <section className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Languages className="h-5 w-5 text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold">Recent Translations</h2>
          </div>
          
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : stats.recentTranslations.length > 0 ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
              {stats.recentTranslations.map((translation) => (
                <TranslationCard key={translation.id} translation={translation} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No translations yet"
              description="Add your first translation to start learning!"
              actionLabel="Add Translation"
              onAction={() => setAddTranslationOpen(true)}
              icon={<Languages className="h-10 w-10 text-blue-400" />}
            />
          )}
        </section>
      </div>

      {/* Dialogs */}
      <AddWordDialog
        open={addWordOpen}
        onOpenChange={setAddWordOpen}
        onAdd={handleAddWord}
      />
      <AddTranslationDialog
        open={addTranslationOpen}
        onOpenChange={setAddTranslationOpen}
        onAdd={handleAddTranslation}
      />
    </div>
  );
}
