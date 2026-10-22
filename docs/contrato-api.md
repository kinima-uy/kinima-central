# Contrato de API Kinima v1

Este documento refleja las rutas implementadas. Los ejemplos son ficticios. La cámara no forma parte del contrato y nunca se envía al servidor.

## Autenticación

- Alta inicial: `POST /api/v1/setup/first-admin` con `bootstrapToken`, nombre, email y contraseña de al menos 12 caracteres. Solo funciona mientras no exista una cuenta administradora.
- Inicio profesional: `POST /api/v1/auth/login`. Devuelve un token Bearer de ocho horas; la aplicación web lo mantiene en memoria.
- Consola: token Bearer individual, generado al registrar una consola. El servidor conserva un hash SHA-256 y muestra el token original una sola vez.
- La API de producción requiere HTTPS detrás de un proxy TLS. El servidor Node queda enlazado a `127.0.0.1`.

## Operación profesional

Las rutas requieren token Bearer profesional y validan rol/acceso:

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/v1/setup/status` | Comprueba si falta la cuenta administradora inicial. |
| `GET` | `/api/v1/professional/me` | Lee el perfil autenticado. |
| `GET`, `POST` | `/api/v1/professional/patients` | Lista pacientes permitidos o crea un código interno y etiqueta corta. |
| `GET` | `/api/v1/professional/devices` | Lista consolas autorizadas y su asignación vigente. |
| `PUT` | `/api/v1/professional/assignments/{deviceId}` | Asigna paciente y ejercicio; incrementa versión y registra auditoría. |
| `DELETE` | `/api/v1/professional/assignments/{deviceId}` | Revoca la asignación vigente. |
| `GET` | `/api/v1/professional/patients/{patientId}/sessions?limit=100` | Consulta sesiones recibidas, limitado a pacientes autorizados. |
| `GET` | `/api/v1/professional/patients/{patientId}/assignments` | Historial de rutinas del paciente (todas las versiones y consolas), limitado a pacientes autorizados. |
| `POST` | `/api/v1/admin/devices` | Registra una consola y devuelve su token una vez (administrador). |
| `POST` | `/api/v1/admin/devices/{deviceId}/rotate-token` | Revoca el token previo y devuelve una credencial nueva una sola vez (administrador). |
| `POST` | `/api/v1/admin/professionals` | Crea una cuenta profesional (administrador). |
| `GET` | `/api/v1/admin/professionals` | Lista cuentas activas (administrador). |
| `GET` | `/api/v1/admin/access` | Lista los accesos compartidos vigentes (administrador). |
| `PUT` | `/api/v1/admin/patients/{patientId}/access` | Comparte acceso a un paciente (administrador). |
| `DELETE` | `/api/v1/admin/patients/{patientId}/access` | Revoca el acceso de un profesional a un paciente (administrador). |
| `PUT` | `/api/v1/admin/devices/{deviceId}/access` | Comparte acceso a una consola (administrador). |
| `DELETE` | `/api/v1/admin/devices/{deviceId}/access` | Revoca el acceso de un profesional a una consola (administrador). |

Los pacientes deben usar códigos internos y etiquetas sin datos identificables directos.

## Operación de la familia

- Inicio de sesión: `POST /api/v1/family/auth/login` con `email` y `password`. Devuelve un token Bearer de ocho horas (mismo formato que el profesional, pero no da acceso a rutas `professional/` ni `admin/`).
- La cuenta de familia la crea un profesional (no hay autorregistro): `POST /api/v1/professional/families` con `{ patientId, email, displayName }`, requiere acceso al paciente. Devuelve `temporaryPassword` una sola vez; se la pasa a la familia por un canal privado.

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/v1/family/me` | Lee el perfil autenticado. |
| `GET` | `/api/v1/family/patients` | Lista los pacientes (hijos) a los que tiene acceso. |
| `GET` | `/api/v1/family/patients/{patientId}/assignment` | Rutina activa del paciente, o `null` si no hay. |
| `GET` | `/api/v1/family/patients/{patientId}/sessions?limit=50` | Progreso: sesiones recientes (fecha, duración, aciertos, si se completó). |

Gestión de acceso (lado profesional, requiere acceso al paciente):

| Método | Ruta | Acción |
|---|---|---|
| `GET` | `/api/v1/professional/patients/{patientId}/family` | Lista las cuentas de familia vinculadas al paciente. |
| `PUT` | `/api/v1/professional/patients/{patientId}/family-access` | Vincula una cuenta de familia existente (`{ familyId }`) a otro paciente (hermanos). |
| `DELETE` | `/api/v1/professional/patients/{patientId}/family-access` | Revoca el acceso de esa familia a ese paciente. |

## Sincronización de consola

### `POST /api/v1/device/sync`

Autenticación Bearer de dispositivo. El identificador del dispositivo se obtiene de la credencial validada.

Solicitud:

```json
{
  "deviceId": "00000000-0000-4000-8000-000000000001",
  "knownAssignmentVersion": 12,
  "lastSessionCursor": null
}
```

Respuesta:

```json
{
  "deviceId": "00000000-0000-4000-8000-000000000001",
  "serverTime": "2026-10-17T15:00:00.000Z",
  "assignment": {
    "version": 13,
    "patientId": "00000000-0000-4000-8000-000000000002",
    "patientCode": "P-001",
    "status": "active",
    "exercise": {
      "horizontalRange": "medium",
      "verticalRange": "medium",
      "workZone": "bilateral",
      "targetSize": "medium",
      "durationSeconds": 30
    }
  },
  "recentSessions": []
}
```

Si no existe una asignación vigente, `assignment` es `null`. El dispositivo guarda la asignación y el resumen reciente cifrados localmente.

### `POST /api/v1/sessions/batch`

La consola envía de 1 a 50 sesiones por solicitud con token Bearer individual. La Raspberry divide una cola grande en lotes de hasta 50 y sigue hasta vaciarla. El API valida dispositivo, paciente, versión histórica de asignación, ejercicio y valores del resultado. Un reintento con el mismo UUID y contenido se acepta sin duplicar la fila; si el mismo UUID vuelve con valores distintos, se rechaza como conflicto de identificador.

```json
{
  "sessions": [
    {
      "id": "00000000-0000-4000-8000-000000000003",
      "patientId": "00000000-0000-4000-8000-000000000002",
      "assignmentVersion": 13,
      "startedAt": "2026-10-17T14:45:00.000Z",
      "durationSeconds": 30,
      "elapsedSeconds": 28,
      "hits": 7,
      "completed": false,
      "configuration": {
        "horizontalRange": "medium",
        "verticalRange": "medium",
        "workZone": "bilateral",
        "targetSize": "medium",
        "durationSeconds": 30
      }
    }
  ]
}
```

Respuesta:

```json
{
  "accepted": ["00000000-0000-4000-8000-000000000003"],
  "rejected": []
}
```

Una sesión sin paciente/asignación válida queda cifrada en la consola como `local_only`; no se envía a PostgreSQL hasta que exista una política segura para asociarla.

## Estado y errores

- `GET /api/v1/health` verifica conexión a PostgreSQL y estado de API.
- Errores usan `{ "error": { "code": "...", "message": "..." } }`.
- La consola no borra sesiones pendientes antes de confirmar aceptación del servidor.
- Un lote puede devolver IDs aceptados y sesiones rechazadas con motivo.
- Los cambios profesionales principales quedan registrados en `audit_events`.
