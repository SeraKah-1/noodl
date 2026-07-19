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
import {
  ensureBuildCoherence,
  getEmbeddedBuildId,
  installServiceWorkerControllerReload,
} from './services/buildCoherence';

/**
 * Option B boot sequence:
 * 1) Compare baked build id vs live /version.json → hard reload if skewed
 * 2) Register SW with autoUpdate; controllerchange → hard reload once
 * 3) Mount React only after coherence check allows it
 */
async function boot(): Promise<void> {
  const coherent = await ensureBuildCoherence();
  if (!coherent) {
    // Hard navigation already scheduled — do not mount a half-dead app.
    return;
  }

  installServiceWorkerControllerReload();

  // Activate waiting SW immediately; controllerchange handler reloads if needed.
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // autoUpdate path: apply waiting worker; page reload comes from
      // controllerchange when this tab was already controlled.
      void updateSW(true);
    },
    onOfflineReady() {
      console.log('Noodl shell is ready offline.');
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Detect deploys while the tab stays open.
      const poke = () => {
        void registration.update();
      };
      window.setInterval(poke, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') poke();
      });
      // Opportunistic mid-session version check (network only).
      window.setInterval(() => {
        void ensureBuildCoherence();
      }, 15 * 60 * 1000);
    },
  });

  console.log(
    `%c🧠 NOODL %c🔑 BYOK multi-provider %c build ${getEmbeddedBuildId().slice(0, 12)}`,
    'background: #1a1a2e; color: #e94560; padding: 8px 12px; font-size: 14px; font-weight: bold; border-radius: 6px 0 0 6px;',
    'background: #34A853; color: white; padding: 8px 12px; font-size: 14px; font-weight: bold;',
    'background: #0f172a; color: #94a3b8; padding: 8px 12px; font-size: 12px; border-radius: 0 6px 6px 0;'
  );

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Could not find root element to mount to');
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ExperimentalSettingsProvider>
        <CameraProvider>
          <ErrorBoundary>
            <React.Suspense
              fallback={
                <div className="min-h-screen grid place-items-center text-slate-500">
                  Loading Noodl…
                </div>
              }
            >
              <App />
            </React.Suspense>
            <ToastHost />
          </ErrorBoundary>
        </CameraProvider>
      </ExperimentalSettingsProvider>
    </React.StrictMode>
  );
}

void boot();
