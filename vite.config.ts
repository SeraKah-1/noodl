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
            maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
            navigateFallback: '/index.html'
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.VITE_USE_VERTEX_AI': JSON.stringify(env.VITE_USE_VERTEX_AI),
        'process.env.VITE_GCP_PROJECT_ID': JSON.stringify(env.VITE_GCP_PROJECT_ID),
        'process.env.VITE_GCP_LOCATION': JSON.stringify(env.VITE_GCP_LOCATION),
        'process.env.VITE_VERTEX_API_KEY': JSON.stringify(env.VITE_VERTEX_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
