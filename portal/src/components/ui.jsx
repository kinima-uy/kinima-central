import { MINGCUTE } from "../lib/mingcute.js";

/* Íconos: MingCute, la familia iconográfica de Kinima (manual de marca, p. 35). */
export function Icon({ name, size = 20, stroke, ...rest }) {
  const d = MINGCUTE[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" {...rest}>
      {d && d.map((x, i) => <path key={i} d={x} />)}
    </svg>
  );
}

export function PageHead({ eyebrow, title, children, back }) {
  return (
    <header className="page-head">
      <div>
        {back}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export const Loading = ({ label = "Cargando…" }) => <div className="state" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
export const ErrorBox = ({ error, onRetry }) => (
  <div className="state state-error" role="alert"><Icon name="alerta" />{error?.message || "Algo salió mal."}{onRetry && <button className="btn btn-line btn-sm" onClick={onRetry}>Reintentar</button>}</div>
);
export const Empty = ({ icon = "pacientes", title, children }) => (
  <div className="empty"><span className="empty-ico"><Icon name={icon} size={26} /></span><h3>{title}</h3>{children && <p>{children}</p>}</div>
);

/* Estado de consola: siempre ícono + texto, nunca solo color. */
const ESTADOS = {
  en_linea: { t: "En línea", c: "ok", i: "wifi" },
  sin_conexion: { t: "Sin conexión", c: "warn", i: "sinwifi" },
  sin_asignar: { t: "Sin asignar", c: "neutral", i: "consola" },
};
export function EstadoConsola({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.sin_asignar;
  return <span className={`pill pill-${e.c}`}><Icon name={e.i} size={14} stroke={2.4} />{e.t}</span>;
}

export function Pendientes({ n }) {
  if (!n) return null;
  return <span className="pill pill-warn"><Icon name="nube" size={14} stroke={2.4} />{n} sin sincronizar</span>;
}

/* Constancia de la semana: anillo con sesiones hechas / objetivo. */
export function Constancia({ hechas, objetivo, size = 46 }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, pct = Math.min(1, hechas / (objetivo || 1));
  return (
    <span className="ring" style={{ width: size, height: size }} role="img" aria-label={`${hechas} de ${objetivo} sesiones esta semana`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? "var(--teal)" : "var(--yellow)"} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b>{hechas}/{objetivo}</b>
    </span>
  );
}
