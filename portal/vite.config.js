import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/* El portal se compila dentro de public/, que Vercel sirve como archivos estáticos junto a la API.
   En desarrollo (npm run dev:portal) las llamadas a /api van a la API local de Express. */
const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root,
  plugins: [react()],
  /* assetsInlineLimit 0: las fuentes van como archivos, porque la política de seguridad (CSP) no permite data: para fuentes. */
  build: { outDir: fileURLToPath(new URL("../public", import.meta.url)), emptyOutDir: true, assetsInlineLimit: 0 },
  server: { proxy: { "/api": "http://127.0.0.1:4174" } },
});
