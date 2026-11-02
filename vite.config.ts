import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    // Em desenvolvimento, o Vite repassa /api para o Worker rodando no wrangler dev
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: { outDir: "dist", emptyOutDir: true },
  test: { include: ["shared/**/*.test.ts", "worker/**/*.test.ts"] },
} as any);
