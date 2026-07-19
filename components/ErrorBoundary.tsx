import { Component, ErrorInfo, ReactNode, createElement } from 'react';
import { t } from '../services/i18n';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EB = class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    // Chunk failures are handled by lazyWithRetry → buildCoherence hard reload.
    // Avoid a second competing reload path here (Option B: one coherence gate).
  }

  render(): ReactNode {
    const state = (this as any).state as State;
    const props = (this as any).props as Props;

    if (state.hasError) {
      if (props.fallback) return props.fallback;

      return createElement(
        'div',
        { className: 'min-h-[100dvh] flex flex-col items-center justify-center text-center p-6 bg-slate-50 text-slate-800' },
        createElement(
          'div',
          { className: 'bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-rose-100 relative overflow-hidden' },
          createElement('div', { className: 'absolute top-0 left-0 w-full h-2 bg-rose-500' }),
          createElement('div', { className: 'text-6xl mb-4' }, '(;X_X)'),
          createElement('h1', { className: 'text-2xl font-black mb-2 text-rose-600' }, t('errorTitle')),
          createElement(
            'p',
            { className: 'text-sm text-slate-500 mb-6 font-medium' },
            t('errorUnexpected')
          ),
          createElement(
            'div',
            { className: 'bg-slate-100 p-3 rounded-lg text-xs text-left mb-6 font-mono overflow-auto max-h-32 text-slate-600 border border-slate-200' },
            state.error?.toString() || 'Unknown error'
          ),
          createElement(
            'button',
            {
              className: 'w-full bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md active:scale-95',
              onClick: () => {
                (this as any).setState({ hasError: false, error: null });
                window.location.reload();
              },
            },
            'Reload app'
          )
        )
      );
    }

    return props.children ?? null;
  }
};

export const ErrorBoundary = EB;
