/*
 * Cálculos que el portal hace sobre los datos (igual con la API real que con los datos de prueba):
 * resumen de cada paciente, racha, tendencia, sugerencias de ajuste y "Para revisar hoy".
 * Más adelante conviene moverlos al servidor para no descargar todas las sesiones.
 */
const DIA = 864e5;
export const avg = (a) => (a.length ? Math.round(a.reduce((t, v) => t + v, 0) / a.length) : null);

/* Aciertos por minuto: permite comparar sesiones de distinta duración. */
export const ritmo = (s) => Math.round((s.aciertos / Math.max(1, s.duracionSeg / 60)) * 10) / 10;

export function racha(ses) {
  const dias = new Set(ses.map((s) => new Date(s.fecha).toDateString()));
  const d = new Date(); let n = 0;
  if (!dias.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (dias.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* Consola en línea si se comunicó con el servidor en los últimos 30 minutos. */
export function estadoConsola(ultimaSync, tienePaciente) {
  if (!tienePaciente) return "sin_asignar";
  return ultimaSync && Date.now() - new Date(ultimaSync).getTime() < 30 * 60000 ? "en_linea" : "sin_conexion";
}

const TAMANOS = ["Grande", "Mediano", "Chico"];
const HORIZ = ["Corto", "Medio", "Amplio"];
/*
 * Sugerencia de ajuste (el profesional decide; nunca se aplica sola).
 * Compara los aciertos por minuto de las 3 últimas sesiones con las 2 primeras de la rutina actual:
 * si mejoró 30% o más y completó las sesiones → más desafío; si bajó 30% o dejó sesiones sin terminar → más fácil.
 */
export function sugerencia(asig, ses, descartada) {
  if (!asig || descartada) return null;
  const actual = ses.filter((s) => s.version === asig.version && s.consolaId === asig.consolaId && s.sincronizada).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (actual.length < 5) return null;
  const base = avg(actual.slice(0, 2).map(ritmo)), ult = actual.slice(-3);
  const reciente = avg(ult.map(ritmo));
  const b = asig.bloques[asig.bloques.length - 1], c = b.config;
  const it = TAMANOS.indexOf(c.tamano), ih = HORIZ.indexOf(c.horizontal);
  const describir = (cambio) => cambio.tamano ? `objetivos de tamaño ${cambio.tamano.toLowerCase()}` : cambio.horizontal ? `alcance horizontal ${cambio.horizontal.toLowerCase()}` : `sesiones de ${cambio.duracion} s`;
  if (reciente >= base * 1.3 && ult.every((s) => s.completa)) {
    const cambio = it < 2 ? { tamano: TAMANOS[it + 1] } : ih < 2 ? { horizontal: HORIZ[ih + 1] } : { duracion: Math.min(600, c.duracion + 30) };
    return { tipo: "subir", titulo: "Está lista para un poco más de desafío", texto: `Pasó de ${base} a ${reciente} aciertos por minuto con esta rutina. Te sugerimos ${describir(cambio)}.`, cambio, bloque: asig.bloques.length - 1 };
  }
  if (reciente <= base * 0.7 || ult.every((s) => !s.completa)) {
    const cambio = it > 0 ? { tamano: TAMANOS[it - 1] } : ih > 0 ? { horizontal: HORIZ[ih - 1] } : { duracion: Math.max(15, c.duracion - 30) };
    return { tipo: "bajar", titulo: "Puede estar costándole", texto: `${reciente < base ? `Bajó de ${base} a ${reciente} aciertos por minuto` : "Dejó sesiones sin terminar"} con esta rutina. Te sugerimos ${describir(cambio)}.`, cambio, bloque: asig.bloques.length - 1 };
  }
  return null;
}
export const motivoSugerencia = (cambio) => `Sugerencia aplicada: ${Object.entries(cambio).map(([k, v]) => `${{ tamano: "tamaño", horizontal: "alcance horizontal", duracion: "duración" }[k]} ${typeof v === "number" ? `${v} s` : String(v).toLowerCase()}`).join(", ")}`;

/* Resumen de un paciente a partir de sus sesiones (más recientes primero) y su historial de rutinas. */
export function resumen(p, { sesiones, asignaciones, consola, extras = {} }) {
  const ses = [...sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const t = Date.now();
  const enSemana = ses.filter((s) => new Date(s.fecha).getTime() >= t - 7 * DIA);
  const semanaPrev = ses.filter((s) => { const x = new Date(s.fecha).getTime(); return x < t - 7 * DIA && x >= t - 14 * DIA; });
  /* Rutina actual: la asignación activa (API real) o la más reciente (datos de prueba). */
  const asig = asignaciones.some((a) => a.estado) ? asignaciones.find((a) => a.estado === "active") || null
    : [...asignaciones].sort((a, b) => b.creada.localeCompare(a.creada))[0] || null;
  const objetivoSemanal = p.objetivoSemanal ?? asig?.dias?.length ?? null;
  const constancia = objetivoSemanal ? Math.min(100, Math.round((ses.filter((s) => new Date(s.fecha).getTime() >= t - 28 * DIA).length / (objetivoSemanal * 4)) * 100)) : null;
  return {
    ...p,
    objetivoSemanal,
    consola: consola || null,
    ultimaSesion: ses[0]?.fecha || null,
    sesionesSemana: enSemana.length,
    promedioSemana: avg(enSemana.map((s) => s.aciertos)),
    ritmoSemana: avg(enSemana.map(ritmo)),
    ritmoSemanaPrev: avg(semanaPrev.map(ritmo)),
    pendientes: ses.filter((s) => !s.sincronizada).length,
    asignacion: asig,
    tendencia: ses.slice(0, 8).reverse().map((s) => s.aciertos),
    constancia,
    racha: racha(ses),
    sugerencia: sugerencia(asig, ses, extras.descartada?.(asig)),
    sinLeer: extras.sinLeer || 0,
    ultimoAnimo: ses.find((s) => s.animo)?.animo || null,
  };
}

/* "Para revisar hoy": lo que puede necesitar atención, ordenado por prioridad. */
export function alertas(resumenes, { mensajesSinLeer = () => null } = {}) {
  const out = [], t = Date.now();
  resumenes.forEach((r) => {
    const reciente = r.ultimoAnimo && r.ultimaSesion && new Date(r.ultimaSesion).getTime() > t - 3 * DIA ? r.ultimoAnimo : null;
    if (reciente === "dolor") out.push({ id: `${r.id}-dolor`, tipo: "familia", prioridad: 1, pacienteId: r.id, codigo: r.codigo, titulo: "La familia avisó que le molestó", texto: r.comentarioDolor || "Marcó “le molestó” después de jugar.", accion: "Ver mensajes", tab: "familia" });
    if (r.sinLeer && reciente !== "dolor") out.push({ id: `${r.id}-msg`, tipo: "mensaje", prioridad: 3, pacienteId: r.id, codigo: r.codigo, titulo: `${r.sinLeer} mensaje${r.sinLeer > 1 ? "s" : ""} de la familia`, texto: mensajesSinLeer(r.id), accion: "Responder", tab: "familia" });
    const c = r.consola;
    if (c?.estado === "sin_conexion" && (!c.ultimaSync || t - new Date(c.ultimaSync).getTime() > DIA)) out.push({ id: `${r.id}-con`, tipo: "consola", prioridad: 2, pacienteId: r.id, codigo: r.codigo, titulo: c.ultimaSync ? `${c.codigo} sin conexión hace ${Math.round((t - new Date(c.ultimaSync).getTime()) / 36e5)} h` : `${c.codigo} todavía no se conectó`, texto: r.pendientes ? `Tiene ${r.pendientes} sesiones guardadas esperando internet.` : "Puede que la familia necesite ayuda con el wifi." });
    if (r.consola && r.ultimaSesion && t - new Date(r.ultimaSesion).getTime() > 3 * DIA) out.push({ id: `${r.id}-inac`, tipo: "inactividad", prioridad: 2, pacienteId: r.id, codigo: r.codigo, titulo: `Lleva ${Math.floor((t - new Date(r.ultimaSesion).getTime()) / DIA)} días sin jugar`, texto: "Puede ser buen momento para contactar a la familia.", ...(r.capMensajes ? { accion: "Escribir", tab: "familia" } : {}) });
    if (r.ritmoSemana != null && r.ritmoSemanaPrev != null && r.ritmoSemana < r.ritmoSemanaPrev * 0.75) out.push({ id: `${r.id}-baja`, tipo: "baja", prioridad: 2, pacienteId: r.id, codigo: r.codigo, titulo: `Bajó su ritmo (${r.ritmoSemanaPrev} → ${r.ritmoSemana} aciertos/min)`, texto: "Comparado con la semana anterior." });
    if (r.sugerencia) out.push({ id: `${r.id}-sug`, tipo: "sugerencia", prioridad: 3, pacienteId: r.id, codigo: r.codigo, titulo: r.sugerencia.titulo, texto: r.sugerencia.texto, accion: "Revisar sugerencia" });
    if (!r.consola) out.push({ id: `${r.id}-asig`, tipo: "asignar", prioridad: 4, pacienteId: r.id, codigo: r.codigo, titulo: "Sin consola asignada", texto: "Asignale una rutina y una consola para que empiece en casa.", accion: "Asignar", to: `/asignar?paciente=${r.id}` });
  });
  return out.sort((a, b) => a.prioridad - b.prioridad);
}
