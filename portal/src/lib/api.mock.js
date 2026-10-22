/*
 * Modo demo: responde con los DATOS DE PRUEBA de src/data/mock.js, sin servidor.
 * Tiene las mismas funciones que api.real.js, así las pantallas no cambian.
 */
import { PROFESIONALES, PACIENTES, CONSOLAS, ASIGNACIONES, SESIONES, METAS, MENSAJES, PLANTILLAS } from "../data/mock.js";
import { EJERCICIOS } from "../data/ejercicios.js";
import { resumen, alertas, sugerencia, motivoSugerencia, avg, ritmo } from "./modelo.js";

const DEMO_PASSWORD = "kinima2026";
const db = {
  profesionales: structuredClone(PROFESIONALES), pacientes: structuredClone(PACIENTES), consolas: structuredClone(CONSOLAS),
  asignaciones: structuredClone(ASIGNACIONES), sesiones: structuredClone(SESIONES), metas: structuredClone(METAS),
  mensajes: structuredClone(MENSAJES), plantillas: structuredClone(PLANTILLAS), descartadas: new Set(),
};
const wait = (v, ms = 250) => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));
const fail = (msg, ms = 400) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));

/* ---------- sesión ---------- */
export function login(email, password) {
  const pro = db.profesionales.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
  if (!pro || password !== DEMO_PASSWORD) return fail("El mail o la contraseña no son correctos.");
  if (!pro.activo) return fail("Tu acceso está deshabilitado. Hablá con quien administra Kinima en tu centro.");
  return wait({ token: "demo", profesional: pro }, 500);
}
export const getSetupStatus = () => wait({ needsFirstAdmin: false }, 50);
export const crearAdminInicial = () => fail("En el modo demo ya hay una cuenta administradora.");
export const salir = () => {};

/* Mapa de alcance (solo demo): posición de cada objetivo (0 a 1) y si se tocó.
   La consola todavía no envía posiciones; cuando lo haga, este mapa usa datos reales. */
function alcance(p, ses) {
  let seed = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const dificil = p.etiqueta.includes("izquierdo") ? [0.15, 0.2] : p.etiqueta.includes("derecha") ? [0.85, 0.2] : [0.5, 0.15];
  return ses.slice(-3).flatMap((s) => [...Array(Math.min(25, s.aciertos + 4))].map(() => {
    const x = rnd(), y = rnd(), dist = Math.hypot(x - dificil[0], y - dificil[1]);
    return { x, y, hit: rnd() < Math.min(0.97, 0.35 + dist * 1.1) };
  }));
}
export const ZONAS = { "Arriba izq.": [0, 0], "Arriba der.": [0.5, 0], "Abajo izq.": [0, 0.5], "Abajo der.": [0.5, 0.5] };
function pctZona(puntos, zona) {
  const [zx, zy] = ZONAS[zona];
  const en = puntos.filter((p) => p.x >= zx && p.x < zx + 0.5 && p.y >= zy && p.y < zy + 0.5);
  return en.length ? Math.round((en.filter((p) => p.hit).length / en.length) * 100) : 0;
}
function metasDe(p, sesDesc, puntos, constancia) {
  return db.metas.filter((m) => m.pacienteId === p.id).map((m) => {
    const actual = m.metrica === "ritmo" ? avg(sesDesc.filter((s) => s.sincronizada).slice(0, 3).map(ritmo)) ?? 0
      : m.metrica === "constancia" ? constancia ?? 0 : pctZona(puntos, m.zona);
    const avance = Math.max(0, Math.min(100, Math.round(((actual - m.base) / (m.objetivo - m.base || 1)) * 100)));
    return { ...m, actual, avance, lograda: actual >= m.objetivo, unidad: m.metrica === "ritmo" ? " /min" : "%" };
  });
}

function res(p) {
  const r = resumen(p, {
    sesiones: db.sesiones.filter((s) => s.pacienteId === p.id),
    asignaciones: db.asignaciones.filter((a) => a.pacienteId === p.id),
    consola: db.consolas.find((c) => c.id === p.consolaId),
    extras: { sinLeer: db.mensajes.filter((m) => m.pacienteId === p.id && m.de === "familia" && !m.leido).length, descartada: (a) => a && db.descartadas.has(`${p.id}-v${a.version}`) },
  });
  const dolor = db.sesiones.filter((s) => s.pacienteId === p.id && s.animo === "dolor").at(-1);
  return { ...r, comentarioDolor: dolor?.comentarioFamilia, capMensajes: true };
}

/* ---------- pacientes ---------- */
export const getPacientes = (profesionalId) => wait(db.pacientes.filter((p) => !profesionalId || p.profesionalId === profesionalId).map(res));
export function getPaciente(id) {
  const p = db.pacientes.find((x) => x.id === id);
  if (!p) return fail("No encontramos ese paciente.");
  const r = res(p);
  const sesiones = db.sesiones.filter((s) => s.pacienteId === id).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const puntos = alcance(p, sesiones);
  return wait({
    ...r, sesiones, alcance: puntos,
    historial: db.asignaciones.filter((a) => a.pacienteId === id).sort((a, b) => b.version - a.version),
    profesional: db.profesionales.find((x) => x.id === p.profesionalId),
    metas: metasDe(p, [...sesiones].reverse(), puntos, r.constancia),
    mensajes: db.mensajes.filter((m) => m.pacienteId === id).sort((a, b) => a.fecha.localeCompare(b.fecha)),
  });
}
export function crearPaciente({ codigo, etiqueta, profesionalId }) {
  if (db.pacientes.some((p) => p.codigo.toLowerCase() === codigo.toLowerCase())) return fail("Ese código ya está registrado.");
  const p = { id: codigo, codigo, etiqueta, edad: null, profesionalId, consolaId: null, objetivoSemanal: null, inicio: new Date().toISOString(), nota: "" };
  db.pacientes.push(p);
  return wait(p);
}
export function guardarNota(id, nota) { db.pacientes.find((x) => x.id === id).nota = nota; return wait({ ok: true }); }

export const getAlertas = (profesionalId) => wait(alertas(db.pacientes.filter((p) => p.profesionalId === profesionalId).map(res), {
  mensajesSinLeer: (id) => db.mensajes.filter((m) => m.pacienteId === id && !m.leido).at(-1)?.texto,
}));

/* ---------- consolas ---------- */
export const getConsolas = () => wait(db.consolas.map((c) => ({ ...c, pacienteCodigo: c.pacienteId })));
export function crearConsola({ codigo, nombre }) {
  if (db.consolas.some((c) => c.codigo.toLowerCase() === codigo.toLowerCase())) return fail("Ese código de consola ya está en uso.");
  const c = { id: codigo, codigo, nombre, estado: "sin_asignar", ultimaSync: null, version: null, pacienteId: null, asignacionVersion: 0, pendientes: 0 };
  db.consolas.push(c);
  return wait({ consola: c, token: "demo-token-solo-de-ejemplo" });
}
export const renovarToken = (id) => wait({ consolaId: id, token: "demo-token-renovado" });

/* ---------- ejercicios y plantillas ---------- */
export const getEjercicios = () => wait(EJERCICIOS, 100);
export const getPlantillas = () => wait(db.plantillas, 100);
export function guardarPlantilla({ nombre, dias, bloques }) { const pl = { id: `pl-${Date.now()}`, nombre, dias, bloques }; db.plantillas.push(pl); return wait(pl); }

/* ---------- rutinas ---------- */
export function crearAsignacion({ pacienteId, consolaId, dias, bloques, motivo = "Cambio de rutina" }) {
  const prev = db.asignaciones.filter((a) => a.consolaId === consolaId).reduce((v, a) => Math.max(v, a.version), 0);
  const nueva = { id: `as-${Date.now()}`, pacienteId, consolaId, dias, bloques, version: prev + 1, creada: new Date().toISOString(), motivo };
  db.asignaciones.push(nueva);
  db.pacientes.find((p) => p.id === pacienteId).consolaId = consolaId;
  db.consolas.forEach((c) => { if (c.pacienteId === pacienteId && c.id !== consolaId) { c.pacienteId = null; c.estado = "sin_asignar"; } });
  db.pacientes.forEach((p) => { if (p.consolaId === consolaId && p.id !== pacienteId) p.consolaId = null; });
  const con = db.consolas.find((c) => c.id === consolaId); con.pacienteId = pacienteId; con.asignacionVersion = nueva.version;
  if (con.estado === "sin_asignar") con.estado = "en_linea";
  return wait(nueva, 600);
}
export function quitarAsignacion(consolaId) {
  const con = db.consolas.find((c) => c.id === consolaId);
  db.pacientes.forEach((p) => { if (p.consolaId === consolaId) p.consolaId = null; });
  Object.assign(con, { pacienteId: null, estado: "sin_asignar" });
  return wait({ ok: true });
}
export function aplicarSugerencia(pacienteId) {
  const p = db.pacientes.find((x) => x.id === pacienteId), r = res(p), sug = r.sugerencia, asig = r.asignacion;
  if (!sug) return fail("La sugerencia ya no aplica.");
  const bloques = structuredClone(asig.bloques);
  Object.assign(bloques[sug.bloque].config, sug.cambio);
  return crearAsignacion({ pacienteId, consolaId: asig.consolaId, dias: asig.dias, bloques, motivo: motivoSugerencia(sug.cambio) });
}
export function descartarSugerencia(pacienteId) {
  const asig = res(db.pacientes.find((x) => x.id === pacienteId)).asignacion;
  db.descartadas.add(`${pacienteId}-v${asig.version}`);
  return wait({ ok: true }, 100);
}

/* ---------- objetivos, mensajes ---------- */
export function agregarMeta(meta) { const m = { id: `m-${Date.now()}`, ...meta }; db.metas.push(m); return wait(m); }
export function borrarMeta(id) { db.metas = db.metas.filter((m) => m.id !== id); return wait({ ok: true }); }
export function enviarMensaje(pacienteId, texto, autor) {
  const m = { id: `ms-${Date.now()}`, pacienteId, de: "profesional", autor, texto, fecha: new Date().toISOString(), leido: true };
  db.mensajes.push(m); return wait(m, 300);
}
export function marcarLeidos(pacienteId) { db.mensajes.forEach((m) => { if (m.pacienteId === pacienteId) m.leido = true; }); return wait({ ok: true }, 50); }

/* ---------- profesionales (solo admin) ---------- */
export const getProfesionales = () => wait(db.profesionales);
export function setProfesionalActivo(id, activo) { db.profesionales.find((p) => p.id === id).activo = activo; return wait({ ok: true }); }
export function crearProfesional({ nombre, email, rol }) {
  if (db.profesionales.some((p) => p.email.toLowerCase() === email.toLowerCase())) return fail("Ya existe una cuenta con ese correo.");
  const p = { id: `pro-${Date.now()}`, nombre, email, rol, especialidad: null, activo: true };
  db.profesionales.push(p); return wait(p);
}

/* Permisos: qué pacientes y consolas ve cada profesional (el admin ve todo). */
const accesos = { pacientes: [{ profesionalId: "pro-2", pacienteId: "KN-0119", codigo: "KN-0119" }], consolas: [] };
export const getAccesos = () => wait(accesos, 100);
const quitar = (lista, f) => { const i = lista.findIndex(f); if (i >= 0) lista.splice(i, 1); return wait({ ok: true }, 100); };
export const darAccesoPaciente = (pacienteId, profesionalId) => { if (!accesos.pacientes.some((a) => a.pacienteId === pacienteId && a.profesionalId === profesionalId)) accesos.pacientes.push({ profesionalId, pacienteId, codigo: pacienteId }); return wait({ ok: true }, 100); };
export const quitarAccesoPaciente = (pacienteId, profesionalId) => quitar(accesos.pacientes, (a) => a.pacienteId === pacienteId && a.profesionalId === profesionalId);
export const darAccesoConsola = (consolaId, profesionalId) => { if (!accesos.consolas.some((a) => a.consolaId === consolaId && a.profesionalId === profesionalId)) accesos.consolas.push({ profesionalId, consolaId, codigo: consolaId }); return wait({ ok: true }, 100); };
export const quitarAccesoConsola = (consolaId, profesionalId) => quitar(accesos.consolas, (a) => a.consolaId === consolaId && a.profesionalId === profesionalId);

/* ---------- acceso familiar (demo: en memoria, nada real) ---------- */
const familias = {};
export const getFamiliasPaciente = (pacienteId) => wait(familias[pacienteId] || [], 100);
export function crearFamilia({ pacienteId, email, nombre }) {
  const f = { id: `fam-${Date.now()}`, email, nombre };
  familias[pacienteId] = [...(familias[pacienteId] || []), f];
  return wait({ familia: f, temporaryPassword: "demo-" + Math.random().toString(36).slice(2, 8) }, 200);
}
export function quitarAccesoFamilia(pacienteId, familyId) {
  familias[pacienteId] = (familias[pacienteId] || []).filter((f) => f.id !== familyId);
  return wait({ ok: true }, 100);
}
