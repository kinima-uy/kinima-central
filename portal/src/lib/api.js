/*
 * Capa de datos del portal. Elige de dónde salen los datos:
 *  · API real (por defecto): la API central de Kinima en el mismo dominio (/api/v1), con PostgreSQL.
 *  · Modo demo (VITE_MODO=demo, y la vista previa): datos de prueba en memoria, para mostrar y diseñar.
 * Las pantallas usan siempre estas mismas funciones.
 *
 * CAP dice qué funciones tienen dónde guardarse. Las que la API todavía no tiene (mensajes, objetivos,
 * notas, días de la semana, varios bloques, plantillas, ánimo, mapa de alcance) se ocultan con la API real.
 */
import * as mock from "./api.mock.js";
import * as real from "./api.real.js";

export const USING_MOCK = import.meta.env.VITE_MODO === "demo" || !!import.meta.env.VITE_PREVIEW;
const impl = USING_MOCK ? mock : real;

export const CAP = USING_MOCK
  ? { dias: true, maxBloques: 3, plantillas: true, mensajes: true, metas: true, notas: true, animo: true, alcance: true, edad: true, desactivarProfesional: true }
  : { dias: false, maxBloques: 1, plantillas: false, mensajes: false, metas: false, notas: false, animo: false, alcance: false, edad: false, desactivarProfesional: false };

const f = (name) => (...args) => impl[name](...args);
export const login = f("login"), salir = f("salir"), getSetupStatus = f("getSetupStatus"), crearAdminInicial = f("crearAdminInicial");
export const getPacientes = f("getPacientes"), getPaciente = f("getPaciente"), crearPaciente = f("crearPaciente"), guardarNota = f("guardarNota"), getAlertas = f("getAlertas");
export const getConsolas = f("getConsolas"), crearConsola = f("crearConsola"), renovarToken = f("renovarToken");
export const getEjercicios = f("getEjercicios"), getPlantillas = f("getPlantillas"), guardarPlantilla = f("guardarPlantilla");
export const crearAsignacion = f("crearAsignacion"), quitarAsignacion = f("quitarAsignacion"), aplicarSugerencia = f("aplicarSugerencia"), descartarSugerencia = f("descartarSugerencia");
export const agregarMeta = f("agregarMeta"), borrarMeta = f("borrarMeta"), enviarMensaje = f("enviarMensaje"), marcarLeidos = f("marcarLeidos");
export const getProfesionales = f("getProfesionales"), setProfesionalActivo = f("setProfesionalActivo"), crearProfesional = f("crearProfesional");
export const getAccesos = f("getAccesos"), darAccesoPaciente = f("darAccesoPaciente"), quitarAccesoPaciente = f("quitarAccesoPaciente"), darAccesoConsola = f("darAccesoConsola"), quitarAccesoConsola = f("quitarAccesoConsola");
export const ZONAS = impl.ZONAS;
