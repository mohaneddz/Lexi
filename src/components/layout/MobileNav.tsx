import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobileNavProps {
  onMenuClick: () => void;
}

export function MobileNav({ onMenuClick }: MobileNavProps) {
  return (
    <div className="md:hidden sticky top-0 h-14 border-b border-border/30 bg-background/90 backdrop-blur-md flex items-center px-4 z-30 shrink-0">
      <Button variant="ghost" size="icon" onClick={onMenuClick} className="text-muted-foreground hover:text-foreground">
        <Menu className="h-6 w-6" />
      </Button>
      <span className="ml-3 font-bold text-lg bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
        Lexi
      </span>
    </div>
  );
}
