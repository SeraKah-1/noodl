import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Stable per deploy (Vercel) or per local build clock. */
function resolveBuildId(): string {
  const env = process.env as Record<string, string | undefined>;
  return (
    env.VERCEL_GIT_COMMIT_SHA ||
    env.VITE_BUILD_ID ||
    env.CF_PAGES_COMMIT_SHA ||
    `local-${Date.now()}`
  );
}

/**
 * Emit version.json + <meta name="noodl-build-id"> so the running bundle can
 * compare itself against the live deploy without trusting any JS cache.
 */
function noodlBuildIdPlugin(buildId: string): Plugin {
  return {
    name: 'noodl-build-id',
    transformIndexHtml(html) {
      if (html.includes('name="noodl-build-id"')) return html;
      return html.replace(
        /<head>/i,
        `<head>\n    <meta name="noodl-build-id" content="${buildId}" />`
      );
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({
          buildId,
          builtAt: new Date().toISOString(),
        }),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const buildId = resolveBuildId();
  // silence unused in case env is only for future flags
  void env;

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: false,
      watch: {
        ignored: ['**/uploads/**'],
      },
    },
    define: {
      // Baked into every JS chunk — compared to /version.json at boot.
      __NOODL_BUILD_ID__: JSON.stringify(buildId),
    },
    plugins: [
      react(),
      noodlBuildIdPlugin(buildId),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'masked-icon.svg',
          'icon-192.png',
          'icon-512.png',
          'icon.jpg',
        ],
        manifest: {
          name: 'Noodl — use your noodle',
          short_name: 'Noodl',
          description: 'Turn notes into high-yield quizzes. Spaced repetition. Multilingual AI.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          // Option B: precache *shell only* — never pin every hashed lazy chunk.
          // (Full JS precache was the amplifier for HistoryScreen-OLD.js 404s.)
          globPatterns: [
            'index.html',
            'version.json',
            'manifest.webmanifest',
            '**/*.{css,ico,png,svg,jpg,jpeg,webp,woff2}',
          ],
          globIgnores: [
            '**/assets/**/*.js',
            '**/assets/**/*.map',
            '**/react-pdf.browser-*.js',
            '**/pdfExportService-*.js',
            '**/vision_*.js',
            '**/geminiService-*.js',
          ],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            /^\/api\//,
            /\/assets\//,
            /version\.json$/i,
            /sw\.js$/i,
            /workbox-.*\.js$/i,
          ],
          runtimeCaching: [
            {
              // Always hit network for app scripts (hashed chunks + entry).
              // Do not cache 404s; do not keep dead hashes in Cache Storage.
              urlPattern: ({ request, url }) =>
                request.destination === 'script' ||
                /\/assets\/.+\.js$/i.test(url.pathname) ||
                /\/workbox-.*\.js$/i.test(url.pathname),
              handler: 'NetworkOnly',
              method: 'GET',
            },
            {
              urlPattern: ({ url }) => url.pathname.endsWith('/version.json'),
              handler: 'NetworkOnly',
              method: 'GET',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
