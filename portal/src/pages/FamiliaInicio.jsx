import { useEffect, useMemo, useState } from "react";
import * as apiFamilia from "../lib/apiFamilia.js";
import { useAuthFamilia } from "../lib/authFamilia.jsx";
import { duracionTexto } from "../data/ejercicios.js";
import { K_PATH, COLORS } from "../lib/brand.jsx";
import { fecha, useData } from "../lib/util.js";
import { Loading, ErrorBox, Empty, Icon } from "../components/ui.jsx";

/* Cada hijo/a rota entre estos tres acentos de marca, para distinguirlos sin ponerle fotos. */
const ACENTOS = [
  { bg: COLORS.teal, tint: "var(--tint-teal)", tx: "var(--tealtx)" },
  { bg: COLORS.coral, tint: "var(--tint-coral)", tx: "var(--coraltx)" },
  { bg: COLORS.yellow, tint: "var(--tint-yellow)", tx: "var(--yellowtx)" },
];

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function useProgreso(patientId) {
  return useData(async () => {
    if (!patientId) return null;
    const [asignacion, sesiones] = await Promise.all([apiFamilia.getAsignacion(patientId), apiFamilia.getSesiones(patientId, 50)]);
    return { asignacion, sesiones };
  }, [patientId]);
}

function Hoy({ asignacion, acento }) {
  if (!asignacion) {
    return (
      <section className="f-hero" style={{ background: acento.tint }}>
        <p className="eyebrow">Hoy toca</p>
        <h3>Todavía no tiene una rutina asignada</h3>
        <p className="desc">Cuando el profesional le asigne una, va a aparecer acá.</p>
      </section>
    );
  }
  return (
    <section className="f-hero" style={{ background: acento.tint }}>
      <svg viewBox="175 415 175 250" aria-hidden="true" className="f-hero-shape" style={{ width: 150, height: 214, color: acento.bg }}>
        <path fill="currentColor" opacity=".35" d={K_PATH} />
      </svg>
      <p className="eyebrow">Hoy toca</p>
      <h3>Alcanzar objetivos</h3>
      <p className="desc">La cámara sigue el dedo índice y toca los objetivos que aparecen en la tele. Un juego simple, pensado para hacer todos los días.</p>
      <span className="f-dur"><Icon name="reloj" size={16} stroke={2.4} />{duracionTexto(asignacion.exercise.durationSeconds)} por sesión</span>
    </section>
  );
}

function Progreso({ sesiones }) {
  const mes = sesiones.filter((s) => Date.now() - new Date(s.startedAt).getTime() < 28 * 864e5).length;
  const ultima = sesiones[0];
  return (
    <div className="f-stats">
      <div className="f-stat" style={{ background: "var(--tint-teal)", color: "var(--tealtx)" }}>
        <b>{mes}</b>
        <span>{mes === 1 ? "sesión este mes" : "sesiones este mes"}</span>
      </div>
      <div className="f-stat" style={{ background: "var(--tint-coral)", color: "var(--coraltx)" }}>
        <b>{ultima ? ultima.hits : "—"}</b>
        <span>aciertos en la última sesión</span>
      </div>
    </div>
  );
}

function Sesiones({ sesiones, acento }) {
  if (!sesiones.length) return <Empty icon="objetivo" title="Todavía no jugó ninguna sesión" />;
  return (
    <div className="f-sesiones">
      {sesiones.slice(0, 12).map((s) => {
        const d = new Date(s.startedAt);
        return (
          <div className="f-sesion" key={s.id}>
            <span className="f-dia" style={{ background: acento.tint, color: acento.tx }}>
              {DIAS[d.getDay()]}<br />{d.getDate()}
            </span>
            <div className="f-sesion-mid">
              <b>{fecha(s.startedAt, { day: "numeric", month: "long" })}</b>
              <small>{duracionTexto(s.elapsedSeconds)}{!s.completed && ` de ${duracionTexto(s.durationSeconds)}`}</small>
            </div>
            <div className="f-aciertos"><span>{s.hits}</span><small>aciertos</small></div>
            <span className="f-estado">
              {s.completed
                ? <Icon name="ok" size={20} stroke={2.6} style={{ color: "var(--tealtx)" }} />
                : <Icon name="reloj" size={20} stroke={2.4} style={{ color: "var(--muted)" }} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Hijo({ patient, acento }) {
  const { data, error, loading, reload } = useProgreso(patient.id);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <>
      <Hoy asignacion={data.asignacion} acento={acento} />
      <Progreso sesiones={data.sesiones} />
      <section>
        <p className="eyebrow">Cómo le fue</p>
        <Sesiones sesiones={data.sesiones} acento={acento} />
      </section>
    </>
  );
}

export default function FamiliaInicio() {
  const { familia } = useAuthFamilia();
  const { data: pacientes, error, loading } = useData(() => apiFamilia.getPacientes(), []);
  const [actual, setActual] = useState(null);
  useEffect(() => { if (pacientes?.length && !actual) setActual(pacientes[0].id); }, [pacientes, actual]);

  const idx = pacientes?.findIndex((p) => p.id === actual) ?? -1;
  const paciente = useMemo(() => pacientes?.find((p) => p.id === actual) || null, [pacientes, actual]);
  const acento = ACENTOS[Math.max(0, idx) % ACENTOS.length];

  return (
    <>
      <p className="familia-saludo"><span>Hola</span>{familia.displayName} 👋</p>

      {loading && <Loading />}
      {error && <ErrorBox error={error} />}
      {!loading && !error && !pacientes?.length && <Empty icon="pacientes" title="Todavía no tenés ningún paciente vinculado">Pedile al profesional que te comparta el acceso.</Empty>}

      {pacientes?.length > 1 && (
        <div className="familia-tabs" role="tablist" aria-label="Pacientes">
          {pacientes.map((p) => (
            <button key={p.id} role="tab" aria-selected={actual === p.id} onClick={() => setActual(p.id)}>{p.etiqueta}</button>
          ))}
        </div>
      )}

      {paciente && <Hijo key={paciente.id} patient={paciente} acento={acento} />}
    </>
  );
}
