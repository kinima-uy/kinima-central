import { useEffect, useMemo, useState } from "react";
import * as apiFamilia from "../lib/apiFamilia.js";
import { configDeApi, configTexto, duracionTexto } from "../data/ejercicios.js";
import { fecha, hora, useData } from "../lib/util.js";
import { Loading, ErrorBox, Empty, Icon } from "../components/ui.jsx";

/* Lee la rutina y las sesiones de un paciente puntual. */
function useProgreso(patientId) {
  return useData(async () => {
    if (!patientId) return null;
    const [asignacion, sesiones] = await Promise.all([apiFamilia.getAsignacion(patientId), apiFamilia.getSesiones(patientId, 50)]);
    return { asignacion, sesiones };
  }, [patientId]);
}

function Rutina({ asignacion }) {
  if (!asignacion) return <Empty icon="asignar" title="Todavía no tiene una rutina asignada">Cuando el profesional le asigne una, va a aparecer acá.</Empty>;
  const bloque = { ejercicioId: "objetivos", config: configDeApi(asignacion.exercise) };
  return (
    <div className="familia-rutina">
      <p className="eyebrow">Rutina actual</p>
      <h3>Alcanzar objetivos</h3>
      <p className="muted">La cámara sigue el dedo índice y toca los objetivos que aparecen en la tele. Cada sesión dura {duracionTexto(asignacion.exercise.durationSeconds)}.</p>
      <p className="small-h">{configTexto(bloque)}</p>
    </div>
  );
}

function Sesiones({ sesiones }) {
  if (!sesiones.length) return <Empty icon="objetivo" title="Todavía no jugó ninguna sesión" />;
  const ultimas = [...sesiones];
  const mes = ultimas.filter((s) => Date.now() - new Date(s.startedAt).getTime() < 28 * 864e5).length;
  return (
    <>
      <div className="hero-nums familia-nums">
        <div className="big"><b>{mes}<small>{mes === 1 ? "sesión" : "sesiones"}</small></b><span>Últimas 4 semanas</span></div>
        <div className="big"><b>{ultimas[0]?.hits ?? "—"}<small>aciertos</small></b><span>Última sesión</span></div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr">Sesiones recientes</caption>
          <thead><tr><th>Fecha</th><th>Duración</th><th>Aciertos</th><th>Estado</th></tr></thead>
          <tbody>
            {ultimas.map((s) => (
              <tr key={s.id}>
                <td>{fecha(s.startedAt, { weekday: "short", day: "numeric", month: "short" })} <span className="muted">{hora(s.startedAt)}</span></td>
                <td>{duracionTexto(s.elapsedSeconds)}{!s.completed && <small className="muted"> de {duracionTexto(s.durationSeconds)}</small>}</td>
                <td><span className="score"><i style={{ width: `${Math.min(60, s.hits * 1.5)}px` }} />{s.hits}</span></td>
                <td>{s.completed ? <span className="pill pill-ok"><Icon name="ok" size={14} stroke={2.6} />Completa</span> : <span className="pill pill-neutral"><Icon name="reloj" size={14} stroke={2.4} />Sin terminar</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Hijo({ patient }) {
  const { data, error, loading, reload } = useProgreso(patient.id);
  if (loading && !data) return <section className="card"><Loading /></section>;
  if (error) return <section className="card"><ErrorBox error={error} onRetry={reload} /></section>;
  return (
    <div className="grid-2">
      <section className="card">
        <Rutina asignacion={data.asignacion} />
      </section>
      <section className="card">
        <div className="card-head"><h2>Cómo le fue</h2></div>
        <Sesiones sesiones={data.sesiones} />
      </section>
    </div>
  );
}

export default function FamiliaInicio() {
  const { data: pacientes, error, loading } = useData(() => apiFamilia.getPacientes(), []);
  const [actual, setActual] = useState(null);
  useEffect(() => { if (pacientes?.length && !actual) setActual(pacientes[0].id); }, [pacientes, actual]);

  const paciente = useMemo(() => pacientes?.find((p) => p.id === actual) || null, [pacientes, actual]);

  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  if (!pacientes?.length) return <div className="page"><Empty icon="pacientes" title="Todavía no tenés ningún paciente vinculado">Pedile al profesional que te comparta el acceso.</Empty></div>;

  return (
    <div className="page">
      {pacientes.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Pacientes">
          {pacientes.map((p) => (
            <button key={p.id} role="tab" aria-selected={actual === p.id} onClick={() => setActual(p.id)}>{p.etiqueta}</button>
          ))}
        </div>
      )}
      {pacientes.length === 1 && <p className="lead-plan">{paciente?.etiqueta}</p>}
      {paciente && <Hijo key={paciente.id} patient={paciente} />}
    </div>
  );
}
