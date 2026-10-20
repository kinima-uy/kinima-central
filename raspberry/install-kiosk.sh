#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-${USER:-}}"
if [[ "$(id -u)" -eq 0 || -z "$RUN_USER" || "$RUN_USER" == "root" ]]; then
  echo "Ejecutá este instalador desde la sesión del usuario que usará Kinima." >&2
  exit 1
fi
if [[ "$PROJECT_DIR" == *' '* ]]; then
  echo "Mové Kinima a una ruta sin espacios (por ejemplo /home/kinima/kinima-web)." >&2
  exit 1
fi
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  echo "Falta $PROJECT_DIR/.env; completalo antes de instalar." >&2
  exit 1
fi
if ! grep -Eq '^KINIMA_API_BASE_URL=https://' "$PROJECT_DIR/.env" || ! grep -Eq '^KINIMA_DEVICE_TOKEN=.{20,}$' "$PROJECT_DIR/.env"; then
  echo "Configurá KINIMA_API_BASE_URL con HTTPS y KINIMA_DEVICE_TOKEN en .env antes de instalar." >&2
  exit 1
fi
if ! grep -Eq '^DEVICE_DATA_KEY=[A-Za-z0-9_-]{43}$' "$PROJECT_DIR/.env"; then
  echo "DEVICE_DATA_KEY debe ser una clave Base64 URL-safe de 32 bytes." >&2
  exit 1
fi
chmod 600 "$PROJECT_DIR/.env"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Instalá Node.js 22.5 o superior antes de continuar." >&2
  exit 1
fi
NODE_VERSION="$("$NODE_BIN" -p 'process.versions.node' 2>/dev/null || true)"
if [[ ! "$NODE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "No se pudo determinar la versión de Node.js." >&2
  exit 1
fi
IFS='.' read -r NODE_MAJOR NODE_MINOR NODE_PATCH <<< "$NODE_VERSION"
if (( NODE_MAJOR < 22 || (NODE_MAJOR == 22 && NODE_MINOR < 5) )); then
  echo "Kinima requiere Node.js 22.5 o superior; se encontró $NODE_VERSION." >&2
  exit 1
fi
NODE_SQLITE_FLAG=""
if "$NODE_BIN" -e 'const [major,minor]=process.versions.node.split(".").map(Number); process.exit((major === 22 && minor < 13) || (major === 23 && minor < 4) ? 0 : 1)' >/dev/null 2>&1; then
  NODE_SQLITE_FLAG="--experimental-sqlite"
fi
if [[ ! -d "$PROJECT_DIR/node_modules/pg" ]]; then
  echo "Ejecutá npm ci en la carpeta del proyecto antes de instalar." >&2
  exit 1
fi
for REQUIRED_FILE in \
  "$PROJECT_DIR/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs" \
  "$PROJECT_DIR/node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js" \
  "$PROJECT_DIR/node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm" \
  "$PROJECT_DIR/node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js" \
  "$PROJECT_DIR/node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm" \
  "$PROJECT_DIR/node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.js" \
  "$PROJECT_DIR/node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.wasm" \
  "$PROJECT_DIR/assets/mediapipe/hand_landmarker.task"; do
  if [[ ! -s "$REQUIRED_FILE" ]]; then
    echo "Falta un recurso local requerido: $REQUIRED_FILE. Ejecutá npm ci y copiá el modelo incluido en el proyecto." >&2
    exit 1
  fi
done
MODEL_FILE="$PROJECT_DIR/assets/mediapipe/hand_landmarker.task"
MODEL_SHA="$(sha256sum "$MODEL_FILE" | cut -d ' ' -f1 | tr '[:lower:]' '[:upper:]')"
if [[ "$MODEL_SHA" != "FBC2A30080C3C557093B5DDFC334698132EB341044CCEE322CCF8BCF3607CDE1" ]]; then
  echo "El modelo de manos no coincide con la versión verificada. Revisá docs/mediapipe-offline.md." >&2
  exit 1
fi
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1; then
  echo "No se encontró Chromium." >&2
  exit 1
fi
CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser)"
RUN_GROUP="$(id -gn "$RUN_USER")"
DATA_DIR="$PROJECT_DIR/data"
USER_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
if [[ -z "$USER_HOME" ]]; then
  echo "No se encontró la carpeta personal de $RUN_USER." >&2
  exit 1
fi
UNIT_PATH="/etc/systemd/system/kinima-device.service"
AUTOSTART_DIR="$USER_HOME/.config/labwc"
AUTOSTART="$AUTOSTART_DIR/autostart"
MARKER_BEGIN="# BEGIN KINIMA KIOSK"
MARKER_END="# END KINIMA KIOSK"

sudo install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0755 "$AUTOSTART_DIR"
sudo install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0750 "$DATA_DIR"
if [[ -f "$AUTOSTART" ]]; then
  cp "$AUTOSTART" "$AUTOSTART.bak.$(date +%Y%m%d%H%M%S)"
  sed -i "/$MARKER_BEGIN/,/$MARKER_END/d" "$AUTOSTART"
fi
cat >> "$AUTOSTART" <<EOF
$MARKER_BEGIN
(while true; do sleep 3; curl --silent --fail http://127.0.0.1:4173/api/local/bootstrap >/dev/null || { sleep 3; continue; }; $CHROMIUM_BIN --kiosk --no-first-run --noerrdialogs --disable-infobars http://127.0.0.1:4173; sleep 2; done) &
$MARKER_END
EOF

sudo tee "$UNIT_PATH" >/dev/null <<EOF
[Unit]
Description=Kinima local encrypted device service
After=local-fs.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$PROJECT_DIR
EnvironmentFile=$PROJECT_DIR/.env
Environment=NODE_ENV=production
ExecStart=$NODE_BIN $NODE_SQLITE_FLAG --env-file=$PROJECT_DIR/.env $PROJECT_DIR/device/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$PROJECT_DIR/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now kinima-device.service
echo "Kinima quedó instalado. Revisá: systemctl status kinima-device"
echo "Reiniciá la Raspberry para confirmar el modo kiosco y concedé la cámara la primera vez."
