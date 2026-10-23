# Arquitectura de Kinima

## Piezas del sistema

1. **Consola familiar:** corre en la computadora o Raspberry Pi. MediaPipe detecta la punta del índice; el video se procesa en el dispositivo y no se guarda ni se transmite.
2. **Servicio local de la consola** (`device/index.js`): sirve el juego web en `/device/`, guarda sesiones cifradas en SQLite y las envía cuando hay conexión.
3. **Portal profesional** (`portal/`, React): permite crear cuentas, pacientes con códigos internos, consolas, asignaciones y consultar sesiones. `professional/` conserva la versión anterior del portal.
4. **API central Express** (`server/index.js`): valida usuarios y consolas, controla permisos y recibe asignaciones e historial.
5. **Vercel:** publica el portal y ejecuta la API como función Node. La función despierta para atender solicitudes y puede escalar con el uso; no es un proceso de Node encendido continuamente.
6. **PostgreSQL administrado:** guarda cuentas profesionales, pacientes, consolas, accesos, asignaciones, sesiones y auditoría. Puede crearse desde la integración de Neon en Vercel Marketplace o conectarse desde otro proveedor PostgreSQL.
7. **GitHub:** guarda el código y sus versiones. Al conectar GitHub con Vercel, los cambios enviados generan vistas previas o publicaciones según la rama.

## Recorrido de los datos

### El profesional asigna un ejercicio

El profesional abre el portal HTTPS y guarda un paciente y una configuración para una consola. El portal envía los datos a la API Express. La API valida su cuenta, permisos y configuración y los guarda en PostgreSQL.

### La consola recibe la asignación

La consola intenta sincronizar con la API al iniciar y luego periódicamente. La API consulta PostgreSQL y devuelve la asignación vigente. Si no hay conexión, la consola mantiene la última asignación válida que guardó localmente.

### Se hace un ejercicio

La cámara y el detector trabajan en la consola. Al terminar, la consola guarda localmente el resultado y lo marca pendiente. Cuando recupera conexión, lo manda a la API por HTTPS. La API verifica que pertenezca a esa consola y asignación, y lo inserta en PostgreSQL sin duplicar reintentos.

### El profesional revisa el historial

El portal pide las sesiones a la API. La API revisa los permisos del profesional y consulta PostgreSQL. Solo devuelve resultados autorizados.

## Desarrollo local sin Docker

La API Express se puede iniciar en esta computadora con Node. Para conectarla a una base remota hace falta configurar `DATABASE_URL` en el archivo privado `kinima.env` y crear las tablas con `npm run db:migrate`. `npm run dev` prepara los archivos del portal y levanta API y portal localmente. La consola local sigue siendo otro proceso en `npm run device`.

Docker Compose y el modo local con PostgreSQL en contenedor quedan como material antiguo. No son necesarios para publicar en Vercel ni para este flujo de desarrollo.

## Privacidad y seguridad

- En producción, el portal y la API usan HTTPS.
- Las claves de PostgreSQL, `JWT_SECRET`, `BOOTSTRAP_TOKEN` y los tokens de consola solo van en variables privadas del entorno; nunca se suben a GitHub.
- Al crear la primera cuenta administradora, hay que quitar `BOOTSTRAP_TOKEN` de Vercel.
- La base conserva códigos internos y etiquetas, no nombres completos ni datos de contacto en este prototipo.
- La consola cifra sus datos locales con `DEVICE_DATA_KEY`. Guardá una copia protegida de esa clave fuera del dispositivo.
- Para construir y mostrar el prototipo, usá información ficticia. Antes de guardar información clínica real, todavía hace falta definir retención, copias de seguridad, recuperación de cuenta y revisar privacidad y seguridad.
