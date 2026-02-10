// SearchBar component with advanced filtering

import { Search, X, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  selectedLanguages?: string[];
  availableLanguages?: string[];
  onLanguageToggle?: (language: string) => void;
  selectedTags?: string[];
  availableTags?: string[];
  onTagToggle?: (tag: string) => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  placeholder?: string;
}

export function SearchBar({
  query,
  onQueryChange,
  selectedLanguages = [],
  availableLanguages = [],
  onLanguageToggle,
  selectedTags = [],
  availableTags = [],
  onTagToggle,
  onClearFilters,
  hasActiveFilters = false,
  placeholder = 'Search...',
}: SearchBarProps) {
  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="pl-10 pr-10 glass border-glass-border h-12 text-base"
        />
        {query && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onQueryChange('')}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Language Filter */}
        {availableLanguages.length > 0 && onLanguageToggle && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="glass border-glass-border gap-2">
                <Filter className="h-3 w-3" />
                Languages
                {selectedLanguages.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                    {selectedLanguages.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="glass-strong w-56">
              <DropdownMenuLabel>Filter by Language</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableLanguages.map((language) => (
                <DropdownMenuCheckboxItem
                  key={language}
                  checked={selectedLanguages.includes(language)}
                  onCheckedChange={() => onLanguageToggle(language)}
                >
                  {language}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Tag Filter */}
        {availableTags.length > 0 && onTagToggle && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="glass border-glass-border gap-2">
                <Filter className="h-3 w-3" />
                Tags
                {selectedTags.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                    {selectedTags.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="glass-strong w-56 max-h-[300px] overflow-y-auto">
              <DropdownMenuLabel>Filter by Tag</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={selectedTags.includes(tag)}
                  onCheckedChange={() => onTagToggle(tag)}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && onClearFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Active Filter Chips */}
      {(selectedLanguages.length > 0 || selectedTags.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {selectedLanguages.map((language) => (
            <Badge
              key={language}
              variant="glass"
              className="cursor-pointer hover:bg-primary/20 transition-colors"
              onClick={() => onLanguageToggle?.(language)}
            >
              {language}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          {selectedTags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer hover:bg-primary/20 transition-colors"
              onClick={() => onTagToggle?.(tag)}
            >
              {tag}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
