import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { FeedbackMessage, subscribeFeedback } from '../services/uiFeedbackService';

export const ToastHost: React.FC = () => {
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  useEffect(() => subscribeFeedback((message) => {
    setMessages((current) => [...current.slice(-2), message]);
    window.setTimeout(() => {
      setMessages((current) => current.filter((item) => item.id !== message.id));
    }, message.durationMs ?? 5000);
  }), []);

  return (
    <div aria-live="polite" aria-atomic="false" className="fixed top-4 right-4 z-[300] w-[min(24rem,calc(100vw-2rem))] space-y-2 pointer-events-none">
      {messages.map((item) => {
        const Icon = item.tone === 'success' ? CheckCircle2 : item.tone === 'error' ? XCircle : Info;
        return (
          <div key={item.id} role={item.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-theme-border bg-theme-bg/95 p-4 text-theme-text shadow-xl backdrop-blur-xl">
            <Icon size={18} className={item.tone === 'success' ? 'text-emerald-500' : item.tone === 'error' ? 'text-rose-500' : 'text-indigo-500'} />
            <p className="flex-1 max-h-60 overflow-auto whitespace-pre-line text-sm leading-relaxed">{item.message}</p>
            {item.actionLabel && item.onAction && (
              <button type="button" onClick={() => { item.onAction?.(); setMessages((current) => current.filter((message) => message.id !== item.id)); }} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
                {item.actionLabel}
              </button>
            )}
            <button type="button" aria-label="Dismiss message" onClick={() => setMessages((current) => current.filter((message) => message.id !== item.id))} className="rounded-lg p-1 text-theme-muted hover:bg-theme-glass">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
