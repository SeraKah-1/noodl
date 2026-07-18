import React, { useEffect, useRef, useCallback, useState } from 'react';
import { isTurnstileSiteKeySet } from '../services/turnstileService';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: (code?: string) => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'flexible';
          appearance?: 'always' | 'execute' | 'interaction-only';
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';

export const isTurnstileConfigured = isTurnstileSiteKeySet();

type Props = {
  onToken: (token: string | null) => void;
  /** Fires when Cloudflare widget itself fails (domain/key) */
  onWidgetError?: (message: string) => void;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
};

/**
 * Cloudflare Turnstile — client widget only.
 * Always verify tokens server-side with TURNSTILE_SECRET_KEY when possible.
 */
export const TurnstileWidget: React.FC<Props> = ({
  onToken,
  onWidgetError,
  theme = 'auto',
  className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrRef = useRef(onWidgetError);
  onTokenRef.current = onToken;
  onErrRef.current = onWidgetError;

  const [status, setStatus] = useState<'idle' | 'ready' | 'ok' | 'error'>('idle');
  const [hint, setHint] = useState<string | null>(null);

  const clearWidget = () => {
    if (widgetId.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetId.current);
      } catch {
        /* ignore */
      }
      widgetId.current = null;
    }
  };

  const mount = useCallback(() => {
    if (!ref.current || !window.turnstile || !SITE_KEY) return;
    clearWidget();
    try {
      // Prefer compact/normal — "flexible" breaks in narrow glass cards
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        theme,
        size: 'normal',
        callback: (token) => {
          setStatus('ok');
          setHint(null);
          onTokenRef.current(token);
        },
        'error-callback': () => {
          setStatus('error');
          const msg =
            'Turnstile widget error. Usually: (1) hostname not allowed in Cloudflare dashboard, (2) wrong site key, or (3) ad-blocker. Add this site’s domain + localhost under Turnstile widget hostnames.';
          setHint(msg);
          onTokenRef.current(null);
          onErrRef.current?.(msg);
        },
        'expired-callback': () => {
          setStatus('ready');
          setHint('Check expired — complete it again.');
          onTokenRef.current(null);
        },
      });
      setStatus('ready');
    } catch (e: any) {
      setStatus('error');
      const msg = e?.message || 'Could not render Turnstile';
      setHint(msg);
      onTokenRef.current(null);
      onErrRef.current?.(msg);
    }
  }, [theme]);

  useEffect(() => {
    if (!isTurnstileConfigured) {
      onTokenRef.current(null);
      return;
    }

    const existing = document.querySelector('script[data-noodl-turnstile]');
    if (window.turnstile) {
      mount();
    } else if (existing) {
      window.onTurnstileLoad = () => mount();
      // script already loading — if already loaded between checks
      if (window.turnstile) mount();
    } else {
      window.onTurnstileLoad = () => mount();
      const s = document.createElement('script');
      s.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
      s.async = true;
      s.defer = true;
      s.dataset.noodlTurnstile = '1';
      s.onerror = () => {
        const msg =
          'Could not load Cloudflare script (blocked network / ad-blocker). Disable blocker or allow challenges.cloudflare.com.';
        setStatus('error');
        setHint(msg);
        onErrRef.current?.(msg);
      };
      document.head.appendChild(s);
    }

    return () => {
      clearWidget();
    };
  }, [mount]);

  if (!isTurnstileConfigured) return null;

  return (
    <div className={className}>
      <div ref={ref} className="cf-turnstile flex justify-center min-h-[65px]" />
      {status === 'ok' && (
        <p className="text-[10px] text-emerald-600 mt-1.5 text-center font-medium">
          Human check OK
        </p>
      )}
      {hint && status === 'error' && (
        <p className="text-[10px] text-rose-600 mt-1.5 text-center leading-snug">{hint}</p>
      )}
      {hint && status === 'ready' && (
        <p className="text-[10px] text-amber-600 mt-1.5 text-center">{hint}</p>
      )}
      {status === 'error' && (
        <button
          type="button"
          onClick={() => {
            setHint(null);
            setStatus('idle');
            onTokenRef.current(null);
            mount();
          }}
          className="mt-2 w-full text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 py-1.5 rounded-lg"
        >
          Retry human check
        </button>
      )}
      <p className="text-[10px] text-theme-muted mt-1.5 text-center">
        Sign-in protection only (not related to AI keys)
      </p>
    </div>
  );
};

export function resetTurnstile() {
  try {
    window.turnstile?.reset();
  } catch {
    /* ignore */
  }
}
