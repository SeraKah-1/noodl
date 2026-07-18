import React, { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'flexible';
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || '';

export const isTurnstileConfigured = Boolean(SITE_KEY && !SITE_KEY.includes('YOUR_'));

type Props = {
  onToken: (token: string | null) => void;
  theme?: 'light' | 'dark' | 'auto';
  className?: string;
};

/**
 * Cloudflare Turnstile — client widget only.
 * Always verify tokens server-side with TURNSTILE_SECRET_KEY.
 */
export const TurnstileWidget: React.FC<Props> = ({ onToken, theme = 'auto', className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const mount = useCallback(() => {
    if (!ref.current || !window.turnstile || !SITE_KEY) return;
    if (widgetId.current) {
      try {
        window.turnstile.remove(widgetId.current);
      } catch {
        /* ignore */
      }
      widgetId.current = null;
    }
    widgetId.current = window.turnstile.render(ref.current, {
      sitekey: SITE_KEY,
      theme,
      size: 'flexible',
      callback: (token) => onTokenRef.current(token),
      'error-callback': () => onTokenRef.current(null),
      'expired-callback': () => onTokenRef.current(null),
    });
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
    } else {
      window.onTurnstileLoad = () => mount();
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
      s.async = true;
      s.defer = true;
      s.dataset.noodlTurnstile = '1';
      document.head.appendChild(s);
    }

    return () => {
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* ignore */
        }
        widgetId.current = null;
      }
    };
  }, [mount]);

  if (!isTurnstileConfigured) return null;

  return (
    <div className={className}>
      <div ref={ref} className="cf-turnstile min-h-[65px]" />
      <p className="text-[10px] text-theme-muted mt-1.5 text-center">
        Human check (Cloudflare) — for sign-in only, not AI
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
