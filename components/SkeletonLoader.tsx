import React from 'react';

/** Pulsing placeholder block */
const Pulse: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-lg bg-white/8 ${className}`} />
);

/** Skeleton for a single quiz card */
export const QuizCardSkeleton: React.FC = () => (
  <div className="bg-theme-glass border border-theme-border rounded-3xl p-8 space-y-6 w-full">
    <div className="flex items-start justify-between">
      <Pulse className="h-4 w-24 rounded-full" />
      <Pulse className="h-4 w-16 rounded-full" />
    </div>
    <Pulse className="h-7 w-full" />
    <Pulse className="h-5 w-3/4" />
    <div className="space-y-3 pt-2">
      {[1, 2, 3, 4].map(i => (
        <Pulse key={i} className="h-14 w-full rounded-2xl" />
      ))}
    </div>
    <div className="flex gap-3 pt-2">
      <Pulse className="h-12 flex-1 rounded-2xl" />
      <Pulse className="h-12 flex-1 rounded-2xl" />
    </div>
  </div>
);

/** Skeleton for a library list item */
export const LibraryItemSkeleton: React.FC = () => (
  <div className="bg-theme-glass border border-theme-border rounded-2xl p-5 flex items-center gap-4">
    <Pulse className="h-12 w-12 rounded-xl shrink-0" />
    <div className="flex-1 space-y-2">
      <Pulse className="h-4 w-2/3" />
      <Pulse className="h-3 w-1/2" />
    </div>
    <Pulse className="h-8 w-20 rounded-xl" />
  </div>
);

/** Skeleton for a list of library items */
export const CardListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-4">
    {Array.from({ length: count }).map((_, i) => (
      <LibraryItemSkeleton key={i} />
    ))}
  </div>
);

/** Skeleton for the settings panel */
export const SettingsSkeleton: React.FC = () => (
  <div className="max-w-2xl mx-auto pt-8 px-4 space-y-6">
    <div className="flex gap-2 justify-center flex-wrap mb-8">
      {[1, 2, 3, 4, 5].map(i => (
        <Pulse key={i} className="h-8 w-24 rounded-full" />
      ))}
    </div>
    <div className="bg-theme-glass border border-theme-border rounded-3xl p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Pulse className="h-12 w-12 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Pulse className="h-6 w-40" />
          <Pulse className="h-4 w-56" />
        </div>
      </div>
      {[1, 2, 3].map(i => (
        <Pulse key={i} className="h-14 w-full rounded-xl" />
      ))}
      <Pulse className="h-12 w-full rounded-xl" />
    </div>
  </div>
);

/** Skeleton for the config screen form */
export const ConfigSkeleton: React.FC = () => (
  <div className="max-w-2xl mx-auto p-4 space-y-6">
    <div className="bg-theme-glass border border-theme-border rounded-3xl p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Pulse className="h-12 w-12 rounded-2xl" />
        <div className="space-y-2 flex-1">
          <Pulse className="h-6 w-48" />
          <Pulse className="h-4 w-64" />
        </div>
      </div>
      {/* Upload area */}
      <Pulse className="h-32 w-full rounded-2xl" />
      {/* Inputs */}
      <Pulse className="h-14 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-4">
        <Pulse className="h-14 rounded-xl" />
        <Pulse className="h-14 rounded-xl" />
      </div>
      {/* Model selector */}
      <Pulse className="h-14 w-full rounded-xl" />
      {/* Submit button */}
      <Pulse className="h-14 w-full rounded-2xl" />
    </div>
  </div>
);

/** Inline skeleton row for model selector */
export const ModelSelectorSkeleton: React.FC = () => (
  <div className="space-y-2">
    <Pulse className="h-4 w-24 rounded" />
    <div className="flex items-center gap-2">
      <Pulse className="h-11 flex-1 rounded-xl" />
      <Pulse className="h-11 w-24 rounded-xl" />
    </div>
  </div>
);

export default {
  QuizCardSkeleton,
  LibraryItemSkeleton,
  CardListSkeleton,
  SettingsSkeleton,
  ConfigSkeleton,
  ModelSelectorSkeleton,
};
