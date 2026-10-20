# Recursos locales de MediaPipe

Kinima sirve MediaPipe y el modelo de manos desde el mismo origen que la aplicación. Esto evita que la detección dependa de un CDN durante cada sesión y permite guardar todos los recursos en el cache del service worker.

## Versiones incluidas

- Paquete JavaScript: @mediapipe/tasks-vision 0.10.35, fijado en package.json y package-lock.json.
- Modelo: Hand Landmarker, variante float16/1, guardado en assets/mediapipe/hand_landmarker.task.
- Tamaño del modelo: 7,819,105 bytes.
- SHA-256 del modelo: FBC2A30080C3C557093B5DDFC334698132EB341044CCEE322CCF8BCF3607CDE1.
- Origen del modelo: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task.

## Preparación y actualización

En una copia nueva del proyecto, ejecutá npm ci; esto instala exactamente la versión bloqueada y sus recursos WebAssembly en node_modules. El modelo está versionado dentro de assets/mediapipe.

Para cambiar MediaPipe, actualizá la dependencia de manera intencional, confirmá que los nombres de los seis archivos de wasm/ siguen coincidiendo con la lista de service-worker.js y el mapa estático de device/index.js, y probá una carga de la app desde http://localhost. Para cambiar el modelo, descargalo desde la fuente elegida, actualizá su SHA-256 en esta guía y confirmá la detección en una sesión de prueba antes de distribuir la nueva versión.

El service worker precarga el módulo, las variantes SIMD/no-SIMD de WebAssembly y el modelo desde el mismo servidor. La Raspberry necesita conexión durante npm ci si no recibe una copia ya preparada del proyecto. No copies .env, las claves de cifrado ni las credenciales del servidor central dentro de una imagen compartida.