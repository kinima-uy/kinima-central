# Unificación del portal (octubre 2026)

Se juntó el backend de Caro (API Express + PostgreSQL + consola) con el portal profesional que diseñó Sol.

## Qué no cambió

- La API, el esquema de la base, la consola (`device/`, `app.js`), la Raspberry y los scripts siguen igual.
- El contrato con la consola es el mismo: `/device/sync` y `/sessions/batch`.

## Qué cambió

| Archivo | Cambio |
|---|---|
| `portal/` | Nuevo: el portal en React. Se compila a `public/` con `npm run build`. |
| `package.json` | Se suman React, React Router, Vite y las fuentes Fredoka y Nunito. `build` compila el portal; `dev:portal` lo abre con recarga automática. |
| `scripts/build-vercel-assets.mjs` | Ya no escribe `public/index.html` (ahora es el portal). Sigue copiando el portal anterior a `/professional/`. |
| `scripts/dev-local.mjs` | Compila el portal antes de levantar la API. |
| `vercel.json` | Fija el framework Express y agrega *rewrites* para que las rutas del portal (`/pacientes/...`) abran la app. Ya no redirige `/` a `/professional/`. |
| `server/index.js` | `/` ya no redirige al portal anterior. Las rutas del portal devuelven `index.html` en desarrollo local. `/professional/` sirve el portal anterior. **Ruta nueva:** `GET /api/v1/professional/patients/{id}/assignments` (historial de rutinas, con el mismo control de acceso que las sesiones). |
| `docs/contrato-api.md` | Documenta la ruta nueva. |

## Cómo usa la API el portal

- Inicio de sesión, cuenta administradora inicial, pacientes (alta con código y etiqueta), consolas (registro con credencial de una sola vez y renovación), asignaciones (asignar y revocar), sesiones, cuentas profesionales y permisos compartidos.
- Si un paciente pasa a otra consola, el portal revoca primero la asignación de la consola anterior para que no queden dos activas.
- El token del profesional se guarda en `sessionStorage` (solo esa pestaña, vence a las 8 horas).
- Constancia, racha, tendencia, alertas y sugerencias se calculan en el navegador a partir de las sesiones. Más adelante conviene moverlo al servidor.

## Pendiente para la base de datos

Para que con la API real funcione todo lo del diseño faltan tablas y rutas para:

- mensajes con la familia;
- objetivos terapéuticos;
- notas del profesional;
- días de la semana y varios bloques por rutina;
- plantillas;
- "cómo se sintió" (lo cargaría la app familiar).

Sugerencia para la consola: enviar también cuántos objetivos aparecieron (no solo los aciertos) y su posición en pantalla. Con eso se puede calcular un porcentaje de logro y dibujar el mapa de alcance.

## Probado

Con PostgreSQL local, se probó el recorrido completo:

1. Cuenta inicial, profesional, pacientes y consolas.
2. Asignación y sincronización de la consola.
3. Lote de sesiones.
4. En el portal: alta de paciente, asignación con el asistente, aplicar una sugerencia, registrar una consola y compartir accesos.
5. Una cuenta profesional que solo ve lo compartido.
