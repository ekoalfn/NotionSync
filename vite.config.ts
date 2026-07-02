// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "node-server",
  },
  vite: {
    plugins: [
      VitePWA({
        // Auto-update SW: new versions activate next time the user opens the app.
        // No prompt; the bottom nav / shell will just be fresh.
        registerType: "autoUpdate",
        // Vite-injects a `<link rel="manifest">` and registers the SW for us.
        injectRegister: "auto",
        // SSR-safe: only generate client-side SW assets.
        strategies: "generateSW",
        // We treat the SPA shell as offline-capable; SSR pages still hydrate
        // when offline because their data lives in IndexedDB via the SW cache.
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
          // Don't try to precache the giant brotli WASM blob.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          // Network-first for navigation so users get fresh SSR HTML when online,
          // fall back to cached shell when offline.
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/api\//, /^\/auth/],
          runtimeCaching: [
            {
              urlPattern: ({ request }) =>
                request.destination === "image" || request.destination === "font",
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts" },
            },
          ],
        },
        // Apple devices ignore most of manifest.json; the meta tags in __root.tsx
        // do the heavy lifting there. This manifest covers Android / desktop install.
        manifest: {
          name: "NowTrack — Inowtech PM Hub",
          short_name: "NowTrack",
          description: "Weekly recap, time tracking, dan AI insights tim — sync dari Notion.",
          theme_color: "#0f0e1a",
          background_color: "#0f0e1a",
          display: "standalone",
          orientation: "portrait",
          scope: "/",
          start_url: "/",
          lang: "id",
          icons: [
            { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
            // Maskable icon: lets Android crop the icon into its adaptive shape
            // without cutting off content (safe zone respected).
            { src: "/maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ],
  },
});
