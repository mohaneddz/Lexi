// EmptyState component with creative illustrations

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  title: string;
  description: string;
  actiondiv?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actiondiv,
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 animate-fade-in">
      {/* Icon */}
      {icon && (
        <div className="mb-4 p-4 rounded-full bg-muted/30 animate-float">
          {icon}
        </div>
      )}

      {/* Text */}
      <h3 className="text-lg font-semibold mb-1 text-center text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">
        {description}
      </p>

      {/* Action */}
      {actiondiv && onAction && (
        <Button
          onClick={onAction}
          className="bg-gradient-primary hover:opacity-90 transition-opacity gap-2"
        >
          <Plus className="h-4 w-4" />
          {actiondiv}
        </Button>
      )}
    </div>
  );
}
