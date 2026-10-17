import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "DMS Sports Arena", short_name: "DMS Arena", description: "Book cricket nets and bowling machines",
        theme_color: "#0F5132", background_color: "#FAF7F0", display: "standalone", start_url: "/", orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//], globPatterns: ["**/*.{js,css,html,svg,png}"] },
    }),
  ],
  server: { port: 5273, strictPort: true, host: true, proxy: { "/api": "http://localhost:3100" } },
  build: { chunkSizeWarningLimit: 900 },
});
