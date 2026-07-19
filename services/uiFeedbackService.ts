export type FeedbackTone = 'info' | 'success' | 'error';

export type FeedbackMessage = {
  id: string;
  message: string;
  tone: FeedbackTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

const EVENT_NAME = 'noodl:feedback';

export function notifyUser(
  message: string,
  tone: FeedbackTone = 'info',
  options: Pick<FeedbackMessage, 'actionLabel' | 'onAction' | 'durationMs'> = {},
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<FeedbackMessage>(EVENT_NAME, {
    detail: { id: crypto.randomUUID?.() || `${Date.now()}`, message, tone, ...options },
  }));
}

export function subscribeFeedback(listener: (message: FeedbackMessage) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<FeedbackMessage>).detail);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
