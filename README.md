# Kinima

Kinima tiene una consola de ejercicio para la familia, un portal para profesionales y un servidor central. La cámara se procesa en la consola: el video no se envía ni se guarda.

## Cómo viajan los datos

```text
Portal profesional ──> API Node + Express en Vercel ──> PostgreSQL administrado
                                                            ▲
Consola Kinima local ── internet: sincroniza sesiones ──────┘
```

- **Portal profesional:** es la app en React de `portal/` (diseño de Kinima). Se compila dentro de `public/` y se publica en la raíz del dominio (`portal.kinima.uy`). El portal anterior en HTML sigue disponible en `/professional/`.
- **API Express:** recibe las solicitudes del portal y de las consolas. En Vercel corre como una función bajo demanda; no queda un proceso de Node encendido todo el tiempo.
- **PostgreSQL:** guarda cuentas profesionales, códigos internos de pacientes, asignaciones y resultados. Se contrata como servicio administrado separado, por ejemplo Neon conectado desde el Marketplace de Vercel.
- **Consola local:** continúa ejecutándose en la computadora o Raspberry. Puede conservar sesiones sin internet y sincronizarlas cuando vuelve la conexión.
- **GitHub:** conserva el código y su historial. Al conectar el repositorio con Vercel, cada cambio enviado a GitHub puede crear una vista previa o una publicación.

Esta arquitectura no necesita Docker. Los archivos de Docker que puedan quedar en el proyecto son antiguos y no forman parte de los pasos nuevos.

## Desarrollo en esta computadora

Necesitás Node.js 22 o posterior, una base PostgreSQL administrada y su URL de conexión.

1. Abrí esta carpeta en Visual Studio Code.
2. En la terminal de VS Code ejecutá `npm ci` para instalar las dependencias.
3. Ejecutá `./scripts/prepare-local-env.ps1` en PowerShell una sola vez. Crea las claves privadas en `%LOCALAPPDATA%\Kinima\kinima.env`, fuera de OneDrive.
4. Cuando creemos la base PostgreSQL, guardá su URL como `DATABASE_URL` en ese archivo. No la pegues en GitHub ni en el código.
5. Ejecutá `npm run db:migrate` una vez para crear las tablas.
6. Ejecutá `npm run dev`. Esto prepara los archivos del portal y levanta la API en `http://127.0.0.1:4174`.
7. Abrí `http://127.0.0.1:4174/` para usar el portal. Para trabajar en el diseño con recarga automática, en otra terminal ejecutá `npm run dev:portal` y abrí `http://localhost:5173` (usa la misma API).

Para ejecutar además la consola local, abrí otra terminal y ejecutá `npm run device`. La consola aparece en `http://127.0.0.1:4173`. Para sincronizar con el servidor publicado, su archivo privado debe tener `KINIMA_API_BASE_URL` apuntando a la dirección HTTPS de Vercel y las credenciales de esa consola.

## Portal (carpeta `portal/`)

- `portal/src/lib/api.js` elige de dónde salen los datos: la **API real** (por defecto) o el **modo demo** con datos de prueba (`VITE_MODO=demo`), que sirve para presentaciones.
- `portal/src/lib/api.real.js` traduce la API (`/api/v1`) al formato que usan las pantallas. `portal/src/data/ejercicios.js` traduce la configuración del ejercicio (tamaño, zona, alcance, duración) a los valores que lee la consola.
- Con la API real el portal oculta lo que todavía no tiene tabla en la base: mensajes con la familia, objetivos terapéuticos, notas, días de la semana, varios bloques por rutina, plantillas, "cómo se sintió" y el mapa de alcance (ver `CAP` en `api.js`).
- Los íconos son MingCute (`portal/src/lib/mingcute.js`) y las fuentes se sirven desde el propio sitio (sin Google Fonts), para respetar la política de seguridad.

## Publicación en Vercel

1. Creá un repositorio privado de GitHub para este proyecto.
2. Conectá ese repositorio a Vercel.
3. Agregá en Vercel las variables `DATABASE_URL`, `JWT_SECRET` y `BOOTSTRAP_TOKEN` para Production y Preview. Usá valores secretos distintos de los ejemplos.
4. Conectá una base PostgreSQL administrada y ejecutá el esquema con `npm run db:migrate` desde una computadora que tenga acceso a esa base.
5. Enviá cada cambio a GitHub. Vercel generará una vista previa; al actualizar la rama principal, publicará la versión nueva.
6. Configurá el dominio `kinima.uy` más adelante, cuando el portal y la API estén listos.

El portal y la API usan el mismo dominio, así que el navegador no necesita permisos especiales para comunicarlos. La consola envía los resultados desde el servicio local hacia la API por HTTPS.

## Costos y uso

Vercel tiene un plan Hobby sin costo para proyectos personales y pequeños prototipos, con límites de uso. Para el uso compartido o comercial de un producto, revisaremos el plan apropiado antes de publicarlo. PostgreSQL tiene su propio plan y límites; puede integrarse desde el Marketplace de Vercel para administrar la conexión y la facturación desde allí.

Al desarrollar o hacer demostraciones, usá códigos y resultados ficticios. No cargues información identificable de pacientes hasta definir y revisar el entorno de privacidad y seguridad adecuado.
