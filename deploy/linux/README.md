# Alternativa anterior: servidor central Kinima en Linux

Esta guía describe la alternativa con un VPS y Docker. El flujo actual elegido para Kinima es API Express en Vercel y PostgreSQL administrado; no sigas estos pasos para esa arquitectura.

Esta plantilla despliega la API Node en el host, PostgreSQL en el Compose del proyecto y Caddy como proxy HTTPS. La API y PostgreSQL solo aceptan conexiones por loopback; a internet se exponen los puertos 80 y 443 de Caddy.

## Preparación del servidor

1. Usá un VPS Linux con dirección estable, un dominio propio, Node.js 22.5 o superior, Docker Engine/Compose y Caddy instalados desde sus canales oficiales.
2. Creá un usuario de sistema `kinima` y ubicá el proyecto en `/opt/kinima/kinima-web`. El código debe quedar legible para `kinima`; el usuario del servicio no necesita permiso para modificarlo después de instalar dependencias.
3. Instalá dependencias con `npm ci` desde la carpeta del proyecto. Creá la carpeta de respaldos con permisos privados para el usuario de servicio: `sudo install -d -o kinima -g kinima -m 0700 /opt/kinima/kinima-web/data/backups`.
4. Creá `/etc/kinima/central.env` a partir de `central.env.example`. Reemplazá todos los valores de ejemplo con secretos diferentes, incluida una clave `BACKUP_DATA_KEY` de 32 bytes; configurá `KINIMA_ENV_FILE=/etc/kinima/central.env`; y asigná el archivo a `kinima:kinima` con modo `0600`. Conservá copias protegidas de `DEVICE_DATA_KEY` y `BACKUP_DATA_KEY` fuera del VPS.
5. Iniciá PostgreSQL como administrador del servidor con `docker compose --env-file /etc/kinima/central.env up -d --wait database`. Aplicá el esquema ejecutando `KINIMA_ENV_FILE=/etc/kinima/central.env npm run db:migrate` desde el proyecto.
6. Copiá `kinima-api.service` a `/etc/systemd/system/kinima-api.service`. Revisá la ruta de Node con `command -v node` y corregí `ExecStart` si no es `/usr/bin/node`. Luego ejecutá `systemctl daemon-reload` y `systemctl enable --now kinima-api`.
7. Copiá `Caddyfile.example` a `/etc/caddy/Caddyfile`, reemplazá `kinima.example.com`, confirmá que el DNS apunta al VPS y que el firewall permite TCP 80/443. Reiniciá Caddy. Caddy obtiene y renueva el certificado TLS automáticamente.
8. En la Raspberry, creá `.env` desde `raspberry/.env.example` y configurá `KINIMA_API_BASE_URL=https://TU-DOMINIO`, `KINIMA_DEVICE_ID`, el token de dispositivo y una `DEVICE_DATA_KEY` propia. No copies las credenciales administrativas, de PostgreSQL ni `BACKUP_DATA_KEY` a la consola. El servicio local cifra la asignación y la cola antes de almacenar sesiones.
9. Abrí `https://TU-DOMINIO/professional`, creá el primer administrador con `BOOTSTRAP_TOKEN`, registrá la consola y asigná el paciente y ejercicio de prueba.
10. Después del alta inicial, borrá `BOOTSTRAP_TOKEN` de `central.env` y reiniciá `kinima-api`.

La API queda enlazada a `127.0.0.1:4174` y PostgreSQL a `127.0.0.1:PGPORT`; no abras esos puertos en el firewall. Caddy termina TLS y reenvía las solicitudes al API local. La API web no recibe acceso al socket de Docker.

## Respaldos

La plantilla programa `kinima-backup.timer` a diario a las 02:30 UTC. Instalá `kinima-backup.service` y `kinima-backup.timer` en `/etc/systemd/system/`, luego ejecutá `systemctl daemon-reload` y `systemctl enable --now kinima-backup.timer`. Las copias aparecen cifradas con AES-256-GCM en `data/backups/` con permisos privados. Probá una restauración con `npm run db:restore-check -- /ruta/al/respaldo.dump.enc kinima_restore_check`; solo crea una base nueva y nunca modifica `PGDATABASE`. Eliminá la base de prueba después de revisar la recuperación.

El servicio de respaldo necesita acceso al socket de Docker porque `pg_dump` se ejecuta dentro del contenedor. La unidad lo limita a ese servicio con el grupo `docker`; ese acceso equivale en la práctica a privilegios de administrador del host. Revisá que el script y el código del proyecto no sean modificables por el usuario del servicio. La plantilla crea una copia local, no una copia fuera del VPS. Configurá y probá además una copia externa cifrada y una restauración en una base separada. No guardes los respaldos junto a `BACKUP_DATA_KEY` o `DEVICE_DATA_KEY` en un espacio compartido.

## Verificación

- `systemctl status kinima-api` confirma el proceso API.
- `systemctl status kinima-backup.timer` muestra el temporizador activo.
- `curl https://TU-DOMINIO/api/v1/health` devuelve `status: ok`.
- `https://TU-DOMINIO/professional` sirve el portal en HTTPS.
- `docker compose --env-file /etc/kinima/central.env ps` muestra PostgreSQL saludable.

Estos archivos son plantillas; no se instalaron en ningún servidor. Antes de usar datos reales, validá permisos, firewall, HTTPS, respaldo externo y restauración en el VPS elegido.
