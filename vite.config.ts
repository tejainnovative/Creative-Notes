import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
const tokens = JSON.parse(readFileSync('design/tokens.json', 'utf8')) as { color: { light: Record<string, string> } };

// Where the app is served from. '/' locally and on Cloudflare; '/<repo>/' on GitHub Pages
// (set by the deploy workflow). Everything below is relative to it.
const base = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: 'es' },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Creative Notes',
        short_name: 'Notes',
        description: 'Meeting notes that work online and offline and stay on your device.',
        start_url: `${base}#/`,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: tokens.color.light.bg,
        theme_color: tokens.color.light.bg,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Start recording', url: `${base}#/record` },
          { name: 'Quick note', url: `${base}#/quick` },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The 14 MB speech runtime is cached on first use (Offline screen), not on every install.
        globIgnores: ['ort/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          // A regex, not a function: workbox copies this into the service worker, where `base` doesn't exist.
          { urlPattern: /\/ort\/ort-wasm-simd-threaded\.(wasm|mjs)$/, handler: 'CacheFirst', options: { cacheName: 'ort-runtime' } },
        ],
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // The local API (npm run api) on 8787; in production the Worker serves /api on the same origin.
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
