import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import 'katex/dist/katex.min.css';
import App from './App';
import { ExperimentalSettingsProvider } from './contexts/ExperimentalSettingsContext';
import { CameraProvider } from './contexts/CameraContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { registerSW } from 'virtual:pwa-register';
import { ToastHost } from './components/ToastHost';
import { notifyUser } from './services/uiFeedbackService';

// Auto-apply new deploys so hashed lazy chunks (e.g. HistoryScreen-XXXX.js)
// cannot stay broken after a Vercel publish. Users with an old tab/SW get one
// clean reload instead of "Failed to fetch dynamically imported module".
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Prefer seamless update; fall back to a toast if updateSW throws.
    try {
      void updateSW(true);
    } catch {
      notifyUser('A new Noodl version is ready.', 'info', {
        actionLabel: 'Reload',
        onAction: () => {
          void updateSW(true);
        },
        durationMs: 15_000,
      });
    }
  },
  onOfflineReady() {
    console.log('Noodl is ready offline.');
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    // Poll for updates while the tab is open (deploy mid-session).
    window.setInterval(() => {
      void registration.update();
    }, 60 * 60 * 1000);
  },
});


// --- Startup banner (BYOK multi-provider; no built-in Vertex) ---
console.log(
  `%c🧠 NOODL %c🔑 BYOK multi-provider`,
  'background: #1a1a2e; color: #e94560; padding: 8px 12px; font-size: 14px; font-weight: bold; border-radius: 6px 0 0 6px;',
  'background: #34A853; color: white; padding: 8px 12px; font-size: 14px; font-weight: bold; border-radius: 0 6px 6px 0;'
);
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ExperimentalSettingsProvider>
      <CameraProvider>
        <ErrorBoundary>
          <React.Suspense fallback={<div className="min-h-screen grid place-items-center text-slate-500">Loading Noodl…</div>}>
            <App />
          </React.Suspense>
          <ToastHost />
        </ErrorBoundary>
      </CameraProvider>
    </ExperimentalSettingsProvider>
  </React.StrictMode>
);
