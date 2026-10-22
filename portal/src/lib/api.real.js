/*
 * Conexión con la API central de Kinima (Express + PostgreSQL, ver docs/contrato-api.md).
 * El portal y la API se publican en el mismo dominio, así que las rutas son relativas (/api/v1/...).
 * Acá no va ningún secreto: el portal solo guarda el token de la sesión, en esta pestaña.
 */
import { configAApi, configDeApi, EJERCICIOS } from "../data/ejercicios.js";
import { resumen, alertas, estadoConsola, motivoSugerencia } from "./modelo.js";

const API = "/api/v1";
const KEY = "kinima-portal-token";
let token = (() => { try { return sessionStorage.getItem(KEY); } catch { return null; } })();
const guardarToken = (t) => { token = t; try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } };

async function req(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/auth/login") {
    guardarToken(null);
    window.dispatchEvent(new Event("kinima:sesion-vencida"));
  }
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Algo salió mal en el servidor."), { status: res.status, code: data?.error?.code });
  cache = method === "GET" ? cache : null;
  return data;
}

/* ---------- traducción API → portal ---------- */
const pro = (p) => ({ id: p.id, nombre: p.displayName, email: p.email, rol: p.role === "administrator" ? "admin" : "profesional", especialidad: null, activo: true });
const consola = (d) => ({
  id: d.id, codigo: d.deviceCode, nombre: d.displayName, ultimaSync: d.lastSeenAt, version: null, pendientes: null,
  pacienteId: d.activeAssignment?.patientId || null, pacienteCodigo: d.activeAssignment?.patientCode || null,
  asignacionVersion: d.activeAssignment?.version || 0,
  estado: estadoConsola(d.lastSeenAt, !!d.activeAssignment),
});
const sesion = (s, pacienteId) => ({
  id: s.id, pacienteId, consolaId: s.deviceId, fecha: s.startedAt, duracionSeg: s.elapsedSeconds, duracionPlan: s.durationSeconds,
  aciertos: s.hits, completa: s.completed, sincronizada: true, version: s.assignmentVersion, config: configDeApi(s.configuration), animo: null,
});
const asignacion = (a, pacienteId) => ({
  id: a.id, pacienteId, consolaId: a.deviceId, consolaCodigo: a.deviceCode, version: a.version, creada: a.createdAt, estado: a.status,
  motivo: null, dias: null, bloques: [{ ejercicioId: "objetivos", config: configDeApi(a.exercise) }],
});
const paciente = (p) => ({ id: p.id, codigo: p.localCode, etiqueta: p.displayLabel, edad: null, inicio: p.createdAt, objetivoSemanal: null, nota: null });

/* Sugerencias descartadas: se recuerdan en este navegador. */
const DESC = "kinima-sugerencias-descartadas";
const descartadas = () => { try { return new Set(JSON.parse(localStorage.getItem(DESC)) || []); } catch { return new Set(); } };
const claveSug = (a) => `${a.pacienteId}-${a.consolaId}-v${a.version}`;

/* ---------- sesión ---------- */
export async function login(email, password) {
  const r = await req("/auth/login", { method: "POST", body: { email: email.trim(), password } });
  guardarToken(r.accessToken);
  return { profesional: pro(r.professional) };
}
export const salir = () => { guardarToken(null); cache = null; };
export const getSetupStatus = () => req("/setup/status");
export async function crearAdminInicial({ bootstrapToken, nombre, email, password }) {
  const r = await req("/setup/first-admin", { method: "POST", body: { bootstrapToken, displayName: nombre, email, password } });
  guardarToken(r.accessToken);
  return { profesional: pro(r.professional) };
}

/* ---------- pacientes ----------
   Hoy el resumen se arma en el navegador: se piden los pacientes, las consolas y las sesiones de cada uno.
   Se guarda unos segundos para no repetir pedidos al pasar entre pantallas. */
let cache = null;
async function cargarTodo() {
  if (cache && Date.now() - cache.t < 4000) return cache.p;
  const p = (async () => {
    const [{ patients }, { devices }] = await Promise.all([req("/professional/patients"), req("/professional/devices")]);
    const consolas = devices.map(consola);
    const desc = descartadas();
    const lista = await Promise.all(patients.map(async (raw) => {
      const pa = paciente(raw);
      const [{ sessions }, { assignments }] = await Promise.all([req(`/professional/patients/${pa.id}/sessions?limit=200`), req(`/professional/patients/${pa.id}/assignments`)]);
      const ses = sessions.map((s) => sesion(s, pa.id));
      const asigs = assignments.map((a) => asignacion(a, pa.id));
      const con = consolas.find((c) => c.pacienteId === pa.id) || null;
      const r = resumen({ ...pa, consolaId: con?.id || null }, { sesiones: ses, asignaciones: asigs, consola: con, extras: { descartada: (a) => a && desc.has(claveSug(a)) } });
      return { r, ses, asigs };
    }));
    return { lista, consolas };
  })();
  cache = { t: Date.now(), p };
  p.catch(() => { cache = null; });
  return p;
}

export async function getPacientes() { return (await cargarTodo()).lista.map((x) => x.r); }
export async function getPaciente(id) {
  const x = (await cargarTodo()).lista.find((y) => y.r.id === id);
  if (!x) throw new Error("No encontramos ese paciente o no tenés acceso.");
  return { ...x.r, sesiones: [...x.ses].sort((a, b) => a.fecha.localeCompare(b.fecha)), historial: [...x.asigs].sort((a, b) => b.creada.localeCompare(a.creada)), alcance: null, metas: [], mensajes: [], profesional: null };
}
export async function crearPaciente({ codigo, etiqueta }) {
  const r = await req("/professional/patients", { method: "POST", body: { localCode: codigo.trim(), displayLabel: etiqueta.trim() } });
  return paciente(r.patient);
}
export async function getAlertas() { return alertas((await cargarTodo()).lista.map((x) => x.r)); }

/* ---------- consolas ---------- */
export async function getConsolas() { return (await cargarTodo()).consolas; }
export async function crearConsola({ codigo, nombre }) {
  const r = await req("/admin/devices", { method: "POST", body: { deviceCode: codigo.trim(), displayName: nombre.trim() } });
  return { consola: { id: r.device.id, codigo: r.device.deviceCode, nombre: r.device.displayName }, token: r.deviceToken };
}
export async function renovarToken(id) { const r = await req(`/admin/devices/${id}/rotate-token`, { method: "POST" }); return { consolaId: r.deviceId, token: r.deviceToken }; }

/* ---------- ejercicios y rutinas ---------- */
export const getEjercicios = async () => EJERCICIOS;
export const getPlantillas = async () => [];

/* La consola ejecuta una configuración a la vez: se envía el primer (y único) bloque de la rutina.
   Si el paciente usaba otra consola, esa asignación se revoca para que no queden dos activas. */
export async function crearAsignacion({ pacienteId, consolaId, bloques }) {
  const { lista } = await cargarTodo();
  const actual = lista.find((x) => x.r.id === pacienteId)?.r.consola;
  if (actual && actual.id !== consolaId) await req(`/professional/assignments/${actual.id}`, { method: "DELETE" });
  const r = await req(`/professional/assignments/${consolaId}`, { method: "PUT", body: { patientId: pacienteId, exercise: configAApi(bloques[0].config) } });
  cache = null;
  return { ...r.assignment, version: r.assignment.version };
}
export async function quitarAsignacion(consolaId) { await req(`/professional/assignments/${consolaId}`, { method: "DELETE" }); cache = null; return { ok: true }; }
export async function aplicarSugerencia(pacienteId) {
  const p = await getPaciente(pacienteId), sug = p.sugerencia, a = p.asignacion;
  if (!sug || !a) throw new Error("La sugerencia ya no aplica.");
  const bloques = structuredClone(a.bloques);
  Object.assign(bloques[sug.bloque].config, sug.cambio);
  const r = await crearAsignacion({ pacienteId, consolaId: a.consolaId, bloques });
  return { ...r, motivo: motivoSugerencia(sug.cambio) };
}
export async function descartarSugerencia(pacienteId) {
  const a = (await getPaciente(pacienteId)).asignacion;
  const d = descartadas(); d.add(claveSug(a));
  try { localStorage.setItem(DESC, JSON.stringify([...d])); } catch { /* sin almacenamiento */ }
  cache = null;
  return { ok: true };
}

/* ---------- profesionales y permisos (solo admin) ---------- */
export async function getProfesionales() { return (await req("/admin/professionals")).professionals.map(pro); }
export async function crearProfesional({ nombre, email, password, rol }) {
  const r = await req("/admin/professionals", { method: "POST", body: { displayName: nombre.trim(), email: email.trim(), password, role: rol === "admin" ? "administrator" : "professional" } });
  return pro(r.professional);
}
export async function getAccesos() {
  const r = await req("/admin/access");
  return {
    pacientes: r.patientAccess.map((a) => ({ profesionalId: a.professionalId, pacienteId: a.patientId, codigo: a.patientCode })),
    consolas: r.deviceAccess.map((a) => ({ profesionalId: a.professionalId, consolaId: a.deviceId, codigo: a.deviceCode })),
  };
}
export const darAccesoPaciente = (pacienteId, profesionalId) => req(`/admin/patients/${pacienteId}/access`, { method: "PUT", body: { professionalId: profesionalId } });
export const quitarAccesoPaciente = (pacienteId, profesionalId) => req(`/admin/patients/${pacienteId}/access`, { method: "DELETE", body: { professionalId: profesionalId } });
export const darAccesoConsola = (consolaId, profesionalId) => req(`/admin/devices/${consolaId}/access`, { method: "PUT", body: { professionalId: profesionalId } });
export const quitarAccesoConsola = (consolaId, profesionalId) => req(`/admin/devices/${consolaId}/access`, { method: "DELETE", body: { professionalId: profesionalId } });

/* ---------- acceso familiar ---------- */
export async function getFamiliasPaciente(patientId) {
  const r = await req(`/professional/patients/${patientId}/family`);
  return r.families.map((f) => ({ id: f.id, email: f.email, nombre: f.displayName }));
}
export async function crearFamilia({ pacienteId, email, nombre }) {
  const r = await req("/professional/families", { method: "POST", body: { patientId: pacienteId, email: email.trim(), displayName: nombre.trim() } });
  return { familia: { id: r.family.id, email: r.family.email, nombre: r.family.displayName }, temporaryPassword: r.temporaryPassword };
}
export const quitarAccesoFamilia = (pacienteId, familyId) => req(`/professional/patients/${pacienteId}/family-access`, { method: "DELETE", body: { familyId } });

/* ---------- todavía sin lugar en la API (el portal oculta estas funciones) ---------- */
const pronto = () => Promise.reject(new Error("Esta función todavía no está disponible con la base de datos real."));
export const guardarNota = pronto, agregarMeta = pronto, borrarMeta = pronto, enviarMensaje = pronto, marcarLeidos = pronto, guardarPlantilla = pronto, setProfesionalActivo = pronto;
export const ZONAS = {};
