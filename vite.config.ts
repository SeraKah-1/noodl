import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: false,
        watch: {
          ignored: ['**/uploads/**']
        }
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'icon-192.png', 'icon-512.png', 'icon.jpg'],
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
                purpose: 'any maskable'
              },
              {
                src: 'icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ]
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,json}'],
            // Optional online/heavy features should not inflate the first offline cache.
            globIgnores: [
              '**/react-pdf.browser-*.js',
              '**/pdfExportService-*.js',
              '**/vision_*.js',
              '**/geminiService-*.js',
            ],
            maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
            navigateFallback: '/index.html'
          }
        })
      ],
      // Do NOT inject server GEMINI_API_KEY / Vertex secrets into the client bundle.
      // AI is BYOK via Settings (localStorage). Only non-secret feature flags if needed.
      define: {},
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
