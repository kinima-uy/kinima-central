/*
 * Corre a mano, en desarrollo, el mismo chequeo de recordatorios que en producción dispara
 * Vercel Cron contra GET /api/v1/internal/cron/reminders (ver vercel.json). Útil para probar sin
 * desplegar: `node scripts/send-exercise-reminders.mjs`.
 */
import { loadKinimaEnv } from "./load-env.mjs";
loadKinimaEnv();
const { createKinimaPool } = await import("../server/db.js");
const { sendExerciseReminders } = await import("../server/push.js");

const pool = createKinimaPool({ max: 3 });
try {
  const resultado = await sendExerciseReminders(pool);
  console.log(`Pacientes sin sesión en 24hs: ${resultado.pacientesSinSesion}. Familias avisadas: ${resultado.familiasAvisadas}.`);
} finally {
  await pool.end();
}
