import React from 'react';

type Props = {
  title: string;
  /** One short line: what this screen is for */
  purpose: string;
  right?: React.ReactNode;
  className?: string;
};

/**
 * Straightforward screen header — title + purpose, not an info dump.
 */
export const PageHeader: React.FC<Props> = ({ title, purpose, right, className = '' }) => (
  <div className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 ${className}`}>
    <div className="min-w-0">
      <h1 className="text-2xl sm:text-3xl font-black text-theme-text tracking-tight">{title}</h1>
      <p className="text-sm text-theme-muted mt-1 max-w-xl leading-snug">{purpose}</p>
    </div>
    {right ? <div className="shrink-0 flex items-center gap-2">{right}</div> : null}
  </div>
);
