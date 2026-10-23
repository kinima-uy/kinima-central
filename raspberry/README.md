# Instalar Kinima en Raspberry Pi 5

La Raspberry ejecuta el juego asignado por el profesional y conserva las sesiones hasta que pueda sincronizarlas. No crea usuarios ni pacientes y no se conecta directamente a PostgreSQL.

## Preparación

1. Instalá Raspberry Pi OS de 64 bits y aplicá las actualizaciones.
2. Instalá Node.js 22.5 o superior, npm, Chromium, curl y Git.
3. Copiá el proyecto a una ruta estable sin espacios, por ejemplo `/home/kinima/kinima-central`. No lo ejecutes desde una carpeta temporal ni una unidad USB.
4. En la carpeta raíz del proyecto, ejecutá `npm ci`.
5. Copiá la plantilla y abrí el archivo privado:

   ```sh
   cp raspberry/.env.example .env
   nano .env
   ```

6. En el portal profesional, abrí **Consolas** y registrá esta Raspberry si todavía no existe. El portal muestra `KINIMA_DEVICE_ID` y `KINIMA_DEVICE_TOKEN` una sola vez. Copiá esos dos valores en `.env`; no los pongas en el portal web, el código fuente, GitHub ni un mensaje.
7. Completá `KINIMA_API_BASE_URL` con el dominio HTTPS de Kinima, sin agregar `/api/v1`. Generá `DEVICE_DATA_KEY` en la Raspberry con:

   ```sh
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
   ```

   Pegá el resultado en `DEVICE_DATA_KEY` y guardá una copia protegida fuera de la Raspberry. La clave permite descifrar las sesiones y la asignación guardadas localmente.

8. Confirmá que `.env` tenga estos valores de ejecución:

   ```text
   NODE_ENV=production
   DEVICE_HOST=127.0.0.1
   DEVICE_PORT=4173
   ```

   `.env` está excluido de Git. No reemplaces la plantilla pública `raspberry/.env.example` con credenciales reales.

9. Asegurate de que Labwc y Chromium abren una sesión gráfica para este usuario.
10. Ejecutá `./raspberry/install-kiosk.sh` y reiniciá la Raspberry.

El instalador requiere sudo para registrar la unidad systemd. Conserva el archivo `~/.config/labwc/autostart` que ya exista y añade una sola entrada Kinima. La unidad local se reinicia automáticamente si Node termina. Antes de instalar, el script valida las credenciales configuradas, la versión de Node, los recursos locales de MediaPipe y la huella del modelo.

## Flujo de la consola

- El profesional crea el paciente, registra la consola y asigna la rutina en el portal.
- La Raspberry se identifica con `KINIMA_DEVICE_ID` y `KINIMA_DEVICE_TOKEN`, descarga la asignación desde la API y muestra su código interno junto con los parámetros del ejercicio.
- El juego usa la cámara solo en la Raspberry. MediaPipe sigue la punta del índice; el video no se guarda ni se envía.
- Al finalizar, el resultado se cifra y guarda en SQLite local. La consola lo envía a la API por HTTPS cuando hay conexión; si está offline, conserva la cola y reintenta más adelante.

No hay inicio de sesión en la Raspberry. La selección de pacientes, consolas y rutinas ocurre en el portal profesional.

## Primer inicio y cámara

El kiosco abre `http://127.0.0.1:4173/device/`. La primera vez, aceptá el permiso de cámara de Chromium y confirmá que se detecta la mano. Chromium recuerda esa autorización para ese usuario; luego reiniciá para comprobar el arranque a pantalla completa.

MediaPipe y el modelo están incluidos como recursos locales del proyecto y se sirven desde la consola. La Raspberry necesita internet durante `npm ci` si no recibe una copia ya preparada del proyecto. Después, el juego local puede ejecutarse aunque la API central no esté disponible. Para actualizar MediaPipe, seguí [docs/mediapipe-offline.md](../docs/mediapipe-offline.md) y verificá la detección antes de distribuir la versión.

## Comprobación

- `systemctl status kinima-device` muestra el servicio local.
- `journalctl -u kinima-device -f` muestra el estado de arranque y sincronización sin imprimir tokens.
- La pantalla muestra la actividad asignada, el estado central y las sesiones pendientes.
- En el portal profesional, verificá que la consola aparezca conectada y que una sesión ficticia llegue al historial.

Usá códigos y resultados ficticios durante las pruebas. No cargues información clínica identificable hasta contar con un entorno y una política de privacidad adecuados.
