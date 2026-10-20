/*
 * Ejercicios que la consola sabe ejecutar y cómo se configuran.
 * "Alcanzar objetivos" usa exactamente la configuración que entiende la consola de la Raspberry
 * (ver docs/contrato-api.md): tamaño, zona de trabajo, alcance horizontal y vertical, y duración.
 */
export const EJERCICIOS = [
  {
    id: "objetivos", nombre: "Alcanzar objetivos", descripcion: "La cámara sigue la punta del dedo índice y el niño toca los objetivos que aparecen en la tele. Cuenta los aciertos durante el tiempo de la sesión.",
    disponible: true, trabaja: ["Motricidad fina", "Coordinación ojo-mano", "Rango de movimiento del hombro"],
    indicaciones: "Sentado o de pie a 1,5–2 m de la tele, con buena luz. Se puede limitar la zona de trabajo a un lado.",
    campos: [
      { id: "tamano", label: "Tamaño de los objetivos", tipo: "opciones", opciones: ["Grande", "Mediano", "Chico"], defecto: "Grande" },
      { id: "zona", label: "Zona de trabajo", tipo: "opciones", opciones: ["Izquierda", "Centro", "Derecha", "Ambos lados"], defecto: "Ambos lados" },
      { id: "horizontal", label: "Alcance horizontal", tipo: "opciones", opciones: ["Corto", "Medio", "Amplio"], defecto: "Medio" },
      { id: "vertical", label: "Alcance vertical", tipo: "opciones", opciones: ["Bajo", "Medio", "Alto"], defecto: "Medio" },
      { id: "duracion", label: "Duración de la sesión", tipo: "numero", min: 15, max: 600, paso: 15, defecto: 60, unidad: "s" },
    ],
  },
  { id: "estrellas", nombre: "Atrapar estrellas", descripcion: "Saltar para atrapar las estrellas que caen del cielo.", disponible: false, trabaja: ["Potencia de piernas", "Equilibrio"], indicaciones: "Se necesita espacio libre alrededor.", campos: [] },
  { id: "marcha", nombre: "Marcha en el lugar", descripcion: "Levantar las rodillas al ritmo del camino para avanzar por el paisaje.", disponible: false, trabaja: ["Coordinación", "Resistencia", "Marcha"], indicaciones: "De pie, frente a la tele.", campos: [] },
];

export const ej = (id) => EJERCICIOS.find((e) => e.id === id);

/* Traducción entre lo que ve el profesional y lo que guarda la API / lee la consola. */
const MAPA = {
  tamano: ["targetSize", { Grande: "large", Mediano: "medium", Chico: "small" }],
  zona: ["workZone", { Izquierda: "left", Centro: "center", Derecha: "right", "Ambos lados": "bilateral" }],
  horizontal: ["horizontalRange", { Corto: "short", Medio: "medium", Amplio: "wide" }],
  vertical: ["verticalRange", { Bajo: "low", Medio: "medium", Alto: "high" }],
};
export function configAApi(c) {
  const out = { durationSeconds: Number(c.duracion) };
  for (const [k, [api, vals]] of Object.entries(MAPA)) out[api] = vals[c[k]];
  return out;
}
export function configDeApi(e = {}) {
  const out = { duracion: Number(e.durationSeconds) || 60 };
  for (const [k, [api, vals]] of Object.entries(MAPA)) out[k] = Object.keys(vals).find((t) => vals[t] === e[api]) || ej("objetivos").campos.find((c) => c.id === k).defecto;
  return out;
}

/* Texto corto de una configuración, para listas y resúmenes. */
export function configTexto(b) {
  const e = ej(b.ejercicioId);
  if (!e) return "";
  return e.campos.map((c) => (c.id === "duracion" ? duracionTexto(b.config[c.id]) : `${c.label.replace(/ de los objetivos| de trabajo| de la sesión/, "")}: ${b.config[c.id]}`)).join(" · ");
}
export const duracionTexto = (s) => (s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`);

/* Cómo se sintió (lo marca la familia en la app familiar después de jugar). */
export const ANIMOS = {
  contento: { emoji: "😄", t: "Contento" },
  normal: { emoji: "🙂", t: "Bien" },
  cansado: { emoji: "😴", t: "Cansado" },
  dolor: { emoji: "😣", t: "Le molestó" },
};
