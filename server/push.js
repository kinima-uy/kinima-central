/*
 * Envío de notificaciones Web Push a las familias (ver docs/contrato-api.md, sección "Notificaciones
 * push"). Un family_id puede tener varias suscripciones (una por navegador/dispositivo instalado).
 * Las claves VAPID se generan una sola vez (`npx web-push generate-vapid-keys`) y se guardan en el
 * entorno del servidor; nunca en el repo.
 */
import webpush from 'web-push';
import https from 'node:https';

// Vercel congela la función entre invocaciones: una conexión 'keep-alive' reutilizada puede
// quedar muerta del otro lado y producir 'write EPIPE' al reusarla. Forzamos conexión nueva
// (sin keep-alive) en cada envío para evitar eso.
const pushAgent = new https.Agent({ keepAlive: false });

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@kinima.uy';
const configured = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (configured) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

export const pushPublicKey = () => (configured ? PUBLIC_KEY : null);

/* Manda `payload` (se serializa a JSON) a cada suscripción de `familyIds` y borra las que el
   navegador ya descartó (404/410: instalación desinstalada o permiso revocado). Nunca lanza: un
   fallo de push no debe tumbar la acción que lo disparó (asignar ejercicio, crear evento). */
export async function notifyFamilies(pool, familyIds, payload) {
  if (!configured || !familyIds || !familyIds.length) return;
  try {
    const ids = [...new Set(familyIds)];
    const subs = await pool.query(
      'SELECT id,family_id,endpoint,p256dh,auth FROM push_subscriptions WHERE family_id = ANY($1::uuid[])',
      [ids]
    );
    const body = JSON.stringify(payload);
    await Promise.all(subs.rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { agent: pushAgent }
        );
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE id=$1', [row.id]).catch(() => {});
        } else {
          console.error('Push falló para', row.id, error?.statusCode || error?.message || error);
        }
      }
    }));
  } catch (error) {
    console.error('notifyFamilies falló:', error?.message || error);
  }
}

/* Familias con acceso a un paciente puntual (p. ej. al asignarle un ejercicio nuevo). */
export async function familyIdsForPatient(pool, patientId) {
  const result = await pool.query('SELECT family_id FROM family_patient_access WHERE patient_id=$1', [patientId]);
  return result.rows.map((row) => row.family_id);
}


/* Recordatorio diario: pacientes con rutina activa que no registraron ninguna sesión en las
   últimas 24 horas. Pensado para correr una vez al día desde /api/v1/internal/cron/reminders
   (Vercel Cron Jobs no ejecuta scripts: solo puede llamar a una ruta HTTP del propio deploy). */
export async function sendExerciseReminders(pool) {
  const { rows } = await pool.query(`
    SELECT a.patient_id
    FROM assignments a
    JOIN patients p ON p.id = a.patient_id AND p.active = TRUE
    WHERE a.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM sessions s
        WHERE s.patient_id = a.patient_id AND s.started_at > now() - interval '24 hours'
      )
  `);
  let avisadas = 0;
  for (const row of rows) {
    const familyIds = await familyIdsForPatient(pool, row.patient_id);
    if (!familyIds.length) continue;
    await notifyFamilies(pool, familyIds, {
      title: 'Recordatorio de ejercicios',
      body: 'Todavía no hiciste el ejercicio de hoy. ¡Dale que podés!',
      tag: `recordatorio-${row.patient_id}-${new Date().toISOString().slice(0, 10)}`,
      url: '/',
    });
    avisadas += 1;
  }
  return { pacientesSinSesion: rows.length, familiasAvisadas: avisadas };
}

/* Todas las familias con algún hijo/a en un centro (p. ej. al publicar un evento del centro). */
export async function familyIdsForCentro(pool, centroId) {
  const result = await pool.query(
    `SELECT DISTINCT fpa.family_id FROM family_patient_access fpa
     JOIN patients p ON p.id = fpa.patient_id
     WHERE p.centro_id=$1 AND p.active=TRUE`,
    [centroId]
  );
  return result.rows.map((row) => row.family_id);
}
