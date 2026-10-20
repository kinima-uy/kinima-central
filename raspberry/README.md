# Instalar Kinima en Raspberry Pi 5

Esta guía configura el servicio local como unidad systemd y abre Chromium en kiosco al iniciar el escritorio Labwc. Ejecutá los pasos con el usuario habitual, no como root.

## Preparación

1. Instalá Raspberry Pi OS de 64 bits y aplicá actualizaciones.
2. Instalá Node.js 22.5 o superior, npm, Chromium, curl y Git.
3. Copiá el proyecto a una ruta estable sin espacios, por ejemplo `/home/kinima/kinima-web`. No lo ejecutes desde una carpeta temporal ni una unidad USB.
4. En la carpeta del proyecto, ejecutá `npm ci`.
5. Creá `.env` a partir de `raspberry/.env.example`. Este archivo contiene solo credenciales del dispositivo; no copies las claves de PostgreSQL, del administrador ni de respaldo a la Raspberry. Configurá `DEVICE_DATA_KEY` como 32 bytes aleatorios codificados en Base64 URL-safe y sin `=` al final. En Linux podés generarla así:

   ```sh
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
   ```

   Pegá el resultado en `DEVICE_DATA_KEY` y guardá una copia segura fuera de la Raspberry. Completá también `KINIMA_DEVICE_ID`, `KINIMA_DEVICE_TOKEN` y la URL HTTPS del API central.

6. Configurá `NODE_ENV=production`, `DEVICE_HOST=127.0.0.1` y `DEVICE_PORT=4173` en `.env`.
7. Asegurate de que Labwc y Chromium abren una sesión gráfica para este usuario.
8. Ejecutá `./raspberry/install-kiosk.sh` y reiniciá la Raspberry.

El instalador requiere sudo para registrar la unidad systemd. Conserva el archivo `~/.config/labwc/autostart` que ya exista y añade una sola entrada Kinima. La unidad local se reinicia automáticamente si Node termina. Antes de instalar, el script verifica la versión de Node, los recursos locales de MediaPipe y la huella del modelo.

## Primer inicio y cámara

La primera vez, iniciá Kinima en el escritorio, aceptá el permiso de cámara de Chromium y confirmá que se detecta la mano. Chromium recuerda esa autorización para ese usuario. Luego reiniciá para confirmar el arranque a pantalla completa sin interacción.

MediaPipe y el modelo están incluidos como recursos locales del proyecto y el service worker los guarda en el primer inicio con el servidor local. Así el ejercicio y la detección de manos quedan disponibles sin conexión después de ese inicio. La preparación inicial sí debe ejecutar npm ci con internet o recibir el proyecto con node_modules ya instalado. Para actualizar la versión, seguí docs/mediapipe-offline.md y verificá el funcionamiento antes de distribuir la nueva versión a las consolas.

## Comprobación

- `systemctl status kinima-device` muestra el servicio local.
- `journalctl -u kinima-device -f` muestra estado de arranque y sincronización sin imprimir tokens.
- El indicador de Kinima muestra consola local, sesiones pendientes o la última sincronización.
- En el portal profesional, verificá que aparezca la conexión de la consola y que una sesión de datos ficticios llegue al historial.

No uses información identificable de pacientes hasta contar con hosting HTTPS, recuperación de respaldos y claves probada, y una revisión clínica/de privacidad adecuada.
