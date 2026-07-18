import React from 'react';
import { motion } from 'framer-motion';

export type DwellTone = 'violet' | 'emerald' | 'indigo';

const TONE: Record<
  DwellTone,
  { ring: string; soft: string; chip: string; glow: string }
> = {
  violet: {
    ring: '#8b5cf6',
    soft: 'bg-violet-50 text-violet-700 border-violet-100',
    chip: 'bg-violet-500/10 text-violet-600',
    glow: 'shadow-violet-500/15',
  },
  emerald: {
    ring: '#10b981',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    chip: 'bg-emerald-500/10 text-emerald-600',
    glow: 'shadow-emerald-500/15',
  },
  indigo: {
    ring: '#6366f1',
    soft: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    chip: 'bg-indigo-500/10 text-indigo-600',
    glow: 'shadow-indigo-500/15',
  },
};

/**
 * Shared dwell HUD — matches Noodl glass cards.
 * Label sits beside the ring (never on top of the arc).
 */
export const DwellIndicator: React.FC<{
  progress: number; // 0–100
  /** Short glyph shown inside ring, e.g. A / → — keep ≤2 chars */
  glyph?: string;
  title: string;
  subtitle?: string;
  tone?: DwellTone;
  /** Show tiny % under glyph track (outside ring text) */
  showPercent?: boolean;
  className?: string;
}> = ({
  progress,
  glyph,
  title,
  subtitle,
  tone = 'violet',
  showPercent = true,
  className = '',
}) => {
  const p = Math.max(0, Math.min(100, progress));
  const done = p >= 99.5;
  const colors = TONE[tone];
  const size = 44;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - p / 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={`
        pointer-events-none select-none
        flex items-center gap-3
        pl-2 pr-3.5 py-2
        rounded-2xl
        bg-white/90 dark:bg-slate-900/90
        backdrop-blur-xl
        border border-white/80 dark:border-slate-700/80
        shadow-xl ${colors.glow}
        ${className}
      `}
    >
      {/* Ring only — no overlapping label inside the stroke path */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="block -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            className="text-slate-200/90 dark:text-slate-700"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colors.ring}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 60ms linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`
              text-[13px] font-semibold tracking-tight tabular-nums
              ${done ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}
            `}
            style={{ fontFeatureSettings: '"tnum"' }}
          >
            {done ? '✓' : glyph || ''}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex flex-col gap-0.5 pr-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 tracking-tight truncate">
            {title}
          </span>
          {showPercent && (
            <span
              className={`
                text-[10px] font-medium tabular-nums px-1.5 py-px rounded-md border
                ${done ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : colors.soft}
              `}
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {done ? 'OK' : `${Math.round(p)}%`}
            </span>
          )}
        </div>
        {subtitle && (
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-none">
            {subtitle}
          </span>
        )}
        {/* Thin track under text — secondary progress, never clashes with glyph */}
        <div className="mt-1 h-1 w-full min-w-[5.5rem] rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-75 ease-linear"
            style={{
              width: `${p}%`,
              background: done
                ? '#10b981'
                : `linear-gradient(90deg, ${colors.ring}cc, ${colors.ring})`,
            }}
          />
        </div>
      </div>
    </motion.div>
  );
};

/** Compact ring for overlay on quiz options (nose dwell) — no text over content */
export const DwellRingBadge: React.FC<{
  progress: number;
  tone?: DwellTone;
  size?: number;
}> = ({ progress, tone = 'emerald', size = 28 }) => {
  const p = Math.max(0, Math.min(100, progress));
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const colors = TONE[tone];

  return (
    <div
      className="relative shrink-0 rounded-full bg-white/95 shadow-md border border-white"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} className="block -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors.ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums text-slate-600"
        style={{ fontFeatureSettings: '"tnum"' }}
      >
        {p >= 99.5 ? '✓' : Math.round(p)}
      </span>
    </div>
  );
};

export default DwellIndicator;
