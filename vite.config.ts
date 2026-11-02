import { resolve } from "node:path";
import { defineConfig } from "vite";

// Isolamento entre origens: necessário para o motor de voz local usar várias threads (SharedArrayBuffer).
const ISOLAMENTO = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  server: {
    port: 5173,
    headers: ISOLAMENTO,
    // Em desenvolvimento, o Vite repassa /api para o Worker rodando no wrangler dev
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  preview: { headers: ISOLAMENTO },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        laboratorio: resolve(__dirname, "laboratorio.html"),
      },
    },
  },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  test: { include: ["shared/**/*.test.ts", "worker/**/*.test.ts", "src/**/*.test.ts"] },
} as any);
