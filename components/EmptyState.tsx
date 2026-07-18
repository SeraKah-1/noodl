import React from 'react';
import { type LucideIcon } from 'lucide-react';

type Props = {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Shared empty state — Design Motion: intentional empty + one primary CTA */
export const EmptyState: React.FC<Props> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <div className="text-center py-16 px-6 bg-theme-glass border-2 border-dashed border-theme-border rounded-[2rem]">
    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
      <Icon size={28} strokeWidth={2} />
    </div>
    <p className="text-theme-text font-bold text-lg">{title}</p>
    {description && (
      <p className="text-sm text-theme-muted mt-2 max-w-sm mx-auto leading-relaxed">{description}</p>
    )}
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="mt-5 inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 shadow-sm"
      >
        {actionLabel}
      </button>
    )}
  </div>
);
