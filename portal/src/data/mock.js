/*
 * DATOS DE PRUEBA — todo inventado. Solo se usan en el modo demo (VITE_MODO=demo) y en la vista previa.
 * Tienen la misma forma que el portal arma a partir de la API real.
 * Los pacientes se identifican con un código interno, nunca con nombre completo.
 */
export const PROFESIONALES = [
  { id: "pro-1", nombre: "Laura Pereira", email: "demo@kinima.uy", rol: "admin", especialidad: "Fisioterapeuta", activo: true },
  { id: "pro-2", nombre: "Martín Silva", email: "martin@kinima.uy", rol: "profesional", especialidad: "Terapeuta ocupacional", activo: true },
  { id: "pro-3", nombre: "Ana Rodríguez", email: "ana@kinima.uy", rol: "profesional", especialidad: "Fisioterapeuta", activo: false },
];

const hoy = new Date();
const dia = (n, h = 17, m = 30) => { const d = new Date(hoy); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d.toISOString(); };
const hace = (min) => new Date(hoy.getTime() - min * 60000).toISOString();

export const CONSOLAS = [
  { id: "RPI-01", codigo: "RPI-01", nombre: "Consola 01", estado: "en_linea", ultimaSync: hace(12), version: "0.4.2", pacienteId: "KN-0142", asignacionVersion: 3, pendientes: 0 },
  { id: "RPI-02", codigo: "RPI-02", nombre: "Consola 02", estado: "en_linea", ultimaSync: hace(25), version: "0.4.2", pacienteId: "KN-0157", asignacionVersion: 1, pendientes: 0 },
  { id: "RPI-03", codigo: "RPI-03", nombre: "Consola 03", estado: "sin_conexion", ultimaSync: hace(60 * 30), version: "0.4.1", pacienteId: "KN-0163", asignacionVersion: 2, pendientes: 2 },
  { id: "RPI-04", codigo: "RPI-04", nombre: "Consola 04", estado: "sin_asignar", ultimaSync: hace(60 * 50), version: "0.4.2", pacienteId: null, asignacionVersion: 0, pendientes: 0 },
];

export const PACIENTES = [
  { id: "KN-0142", codigo: "KN-0142", etiqueta: "Motricidad fina · mano derecha", edad: 7, profesionalId: "pro-1", consolaId: "RPI-01", objetivoSemanal: 5, inicio: dia(24), nota: "Muy motivada con el juego. Subir dificultad de a poco." },
  { id: "KN-0157", codigo: "KN-0157", etiqueta: "Coordinación ojo-mano", edad: 9, profesionalId: "pro-1", consolaId: "RPI-02", objetivoSemanal: 4, inicio: dia(12), nota: "" },
  { id: "KN-0163", codigo: "KN-0163", etiqueta: "Rango de movimiento · hombro izquierdo", edad: 6, profesionalId: "pro-1", consolaId: "RPI-03", objetivoSemanal: 5, inicio: dia(30), nota: "La consola estuvo sin internet; hay sesiones pendientes de sincronizar." },
  { id: "KN-0171", codigo: "KN-0171", etiqueta: "Motricidad fina · ambas manos", edad: 8, profesionalId: "pro-1", consolaId: null, objetivoSemanal: 3, inicio: dia(2), nota: "Esperando que la familia reciba el kit." },
  { id: "KN-0119", codigo: "KN-0119", etiqueta: "Coordinación bilateral", edad: 10, profesionalId: "pro-2", consolaId: null, objetivoSemanal: 4, inicio: dia(40), nota: "" },
];

/* Configuración de "Alcanzar objetivos", con los mismos valores que entiende la consola. */
const OBJ = (tamano, zona, horizontal, vertical, duracion) => ({ ejercicioId: "objetivos", config: { tamano, zona, horizontal, vertical, duracion } });

/* Asignación = rutina: días de la semana (0 = domingo) y uno o más bloques. Cada cambio crea una versión nueva. */
export const ASIGNACIONES = [
  { id: "as-1a", pacienteId: "KN-0142", consolaId: "RPI-01", dias: [1, 3, 5], bloques: [OBJ("Grande", "Derecha", "Corto", "Medio", 120)], version: 1, creada: dia(21, 10), motivo: "Inicio" },
  { id: "as-1b", pacienteId: "KN-0142", consolaId: "RPI-01", dias: [1, 2, 3, 4, 5], bloques: [OBJ("Grande", "Derecha", "Medio", "Medio", 180)], version: 2, creada: dia(13, 10), motivo: "Más días y más alcance" },
  { id: "as-1c", pacienteId: "KN-0142", consolaId: "RPI-01", dias: [1, 2, 3, 4, 5], bloques: [OBJ("Mediano", "Derecha", "Medio", "Medio", 180)], version: 3, creada: dia(6, 10), motivo: "Sugerencia aplicada: tamaño mediano" },
  { id: "as-2", pacienteId: "KN-0157", consolaId: "RPI-02", dias: [1, 3, 5, 6], bloques: [OBJ("Grande", "Ambos lados", "Medio", "Medio", 180)], version: 1, creada: dia(12, 11), motivo: "Inicio" },
  { id: "as-3a", pacienteId: "KN-0163", consolaId: "RPI-03", dias: [1, 2, 3, 4, 5], bloques: [OBJ("Grande", "Izquierda", "Corto", "Bajo", 120)], version: 1, creada: dia(26, 9), motivo: "Inicio" },
  { id: "as-3b", pacienteId: "KN-0163", consolaId: "RPI-03", dias: [1, 2, 3, 4, 5], bloques: [OBJ("Grande", "Izquierda", "Medio", "Medio", 180), OBJ("Grande", "Derecha", "Medio", "Medio", 60)], version: 2, creada: dia(14, 9), motivo: "Se suma un bloque con el lado derecho para entrar en calor" },
];

/* Plantillas de rutina reutilizables entre pacientes parecidos. */
export const PLANTILLAS = [
  { id: "pl-1", nombre: "Inicio suave", dias: [1, 3, 5], bloques: [OBJ("Grande", "Ambos lados", "Corto", "Medio", 90)] },
  { id: "pl-2", nombre: "Hombro · rango de movimiento", dias: [1, 2, 3, 4, 5], bloques: [OBJ("Grande", "Derecha", "Medio", "Medio", 60), OBJ("Grande", "Izquierda", "Amplio", "Alto", 180)] },
  { id: "pl-3", nombre: "Precisión", dias: [1, 2, 4, 5], bloques: [OBJ("Chico", "Ambos lados", "Amplio", "Medio", 240)] },
];

/* Sesiones: lo que la consola calcula y envía (sin video): aciertos durante el tiempo de la sesión. */
function serie(pacienteId, dias, base, crece, animos = {}) {
  const asigs = ASIGNACIONES.filter((a) => a.pacienteId === pacienteId);
  return dias.map((d, i) => {
    const fecha = dia(d, 17 + (i % 3), (i * 13) % 60);
    const a = [...asigs].reverse().find((x) => x.creada <= fecha) || asigs[0];
    const dur = a.bloques.reduce((t, b) => t + b.config.duracion, 0);
    const porMin = base + i * crece + ((i * 7) % 3) * 0.6;
    const completa = !(i % 9 === 4);
    const seg = completa ? dur : Math.round(dur * 0.6);
    const an = animos[i] || (i % 4 === 1 ? ["normal"] : ["contento"]);
    return {
      id: `${pacienteId}-s${i}`, pacienteId, consolaId: a.consolaId, fecha, duracionSeg: seg, duracionPlan: dur,
      aciertos: Math.round((porMin * seg) / 60), completa, sincronizada: true, version: a.version, config: a.bloques[0].config,
      animo: an[0], comentarioFamilia: an[1] || "",
    };
  });
}
export const SESIONES = [
  ...serie("KN-0142", [20, 19, 17, 16, 14, 13, 12, 10, 9, 7, 5, 3, 2, 1, 0], 6, 0.55, { 14: ["contento", "¡Quiso jugar dos veces!"] }),
  ...serie("KN-0157", [11, 9, 8, 6, 4, 2], 7, -0.6, { 3: ["cansado"], 5: ["dolor", "Al final dijo que le molestaba el brazo."] }),
  ...serie("KN-0163", [25, 23, 21, 18, 16, 15, 13, 11], 4, 0.3, { 6: ["cansado", "Estaba con sueño."] }),
  { id: "KN-0163-p1", pacienteId: "KN-0163", consolaId: "RPI-03", fecha: dia(1), duracionSeg: 240, duracionPlan: 240, aciertos: 26, completa: true, sincronizada: false, version: 2, config: ASIGNACIONES[5].bloques[0].config, animo: null, comentarioFamilia: "" },
  { id: "KN-0163-p2", pacienteId: "KN-0163", consolaId: "RPI-03", fecha: dia(0, 11), duracionSeg: 240, duracionPlan: 240, aciertos: 28, completa: true, sincronizada: false, version: 2, config: ASIGNACIONES[5].bloques[0].config, animo: null, comentarioFamilia: "" },
];

/* Objetivos terapéuticos medibles. metrica: "ritmo" (aciertos por minuto, promedio de las últimas 3),
   "constancia" (% del mes) o "zona" (% logrado en una zona de la pantalla). */
export const METAS = [
  { id: "m-1", pacienteId: "KN-0142", texto: "Sostener 14 aciertos por minuto con objetivos medianos", metrica: "ritmo", base: 6, objetivo: 14, fechaLimite: dia(-14) },
  { id: "m-2", pacienteId: "KN-0142", texto: "Jugar 5 veces por semana", metrica: "constancia", base: 0, objetivo: 100, fechaLimite: dia(-21) },
  { id: "m-3", pacienteId: "KN-0163", texto: "Alcanzar objetivos arriba a la izquierda", metrica: "zona", zona: "Arriba izq.", base: 20, objetivo: 80, fechaLimite: dia(-28) },
  { id: "m-4", pacienteId: "KN-0157", texto: "Llegar a 8 aciertos por minuto con ambos lados", metrica: "ritmo", base: 5, objetivo: 8, fechaLimite: dia(-10) },
];

/* Mensajes entre profesional y familia (los ve también la app familiar). */
export const MENSAJES = [
  { id: "ms-1", pacienteId: "KN-0142", de: "profesional", autor: "Laura", texto: "¡Qué bien viene esta semana! Achicamos un poco los objetivos para que sea un desafío.", fecha: dia(6, 10, 5), leido: true },
  { id: "ms-2", pacienteId: "KN-0142", de: "familia", autor: "Familia de KN-0142", texto: "¡Gracias! Le encantan las estrellitas del final. Hoy quiso jugar dos veces.", fecha: dia(0, 19, 10), leido: false },
  { id: "ms-3", pacienteId: "KN-0157", de: "familia", autor: "Familia de KN-0157", texto: "Ayer terminó diciendo que le molestaba el brazo. ¿Seguimos igual o paramos un día?", fecha: dia(1, 20, 30), leido: false },
  { id: "ms-4", pacienteId: "KN-0163", de: "profesional", autor: "Laura", texto: "Vimos que la consola no se conecta. ¿Pueden revisar que el wifi esté encendido?", fecha: dia(1, 9, 0), leido: true },
  { id: "ms-5", pacienteId: "KN-0163", de: "familia", autor: "Familia de KN-0163", texto: "Cambiamos el router, mañana lo conectamos de nuevo.", fecha: dia(0, 8, 40), leido: true },
];
