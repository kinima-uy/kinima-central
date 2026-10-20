import { execSync } from "node:child_process";

/* Desarrollo local: compila el portal (React) dentro de public/ y levanta la API en http://127.0.0.1:4174.
   Para trabajar en el diseño con recarga automática, en otra terminal: npm run dev:portal (http://localhost:5173). */
execSync("npx vite build --config portal/vite.config.js", { stdio: "inherit" });
await import("./build-vercel-assets.mjs");
await import("./run-server.mjs");
