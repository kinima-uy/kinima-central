const SHELL_CACHE = "kinima-shell-v4";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./local-store.js",
  "./manifest.webmanifest",
  "./kinima-icon.svg",
  "./assets/kinima-isotipo.png",
  "./assets/kinima-logo-azul.png",
  "./assets/kinima-logo-crema.png",
  "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs",
  "./node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js",
  "./node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm",
  "./node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js",
  "./node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm",
  "./node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js",
  "./node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm",
  "./assets/mediapipe/hand_landmarker.task"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith("/api/")) return;
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        await cache.put("./index.html", response.clone());
        return response;
      } catch {
        return (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(request)) || Response.error();
    }
  })());
});
