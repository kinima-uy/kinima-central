import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import * as api from "../lib/api.js";
import { CAP } from "../lib/api.js";
import { ritmo } from "../lib/modelo.js";
import { configTexto, duracionTexto } from "../data/ejercicios.js";
import { useAuth } from "../lib/auth.jsx";
import { useData, haceCuanto, fecha, hora } from "../lib/util.js";
import { PageHead, Loading, ErrorBox, Icon, EstadoConsola, Empty } from "../components/ui.jsx";
import { CurvaProgreso, MapaAlcance, Semana, Cintas } from "../components/viz.jsx";
import { Sugerencia, Metas, Familia, Rutina, Animo, diasTexto } from "../components/clinica.jsx";

export default function Paciente() {
  const { id } = useParams();
  const { profesional } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: p, error, loading, reload } = useData(() => api.getPaciente(id), [id]);
  const tab = params.get("tab") || "resumen";
  const setTab = (t) => setParams(t === "resumen" ? {} : { tab: t }, { replace: true });
  const [nota, setNota] = useState("");
  const [guardada, setGuardada] = useState(false);
  useEffect(() => { if (p) setNota(p.nota || ""); }, [p]);

  const back = <Link className="back" to="/pacientes"><Icon name="atras" size={16} />Pacientes</Link>;
  if (loading && !p) return <div className="page">{back}<Loading /></div>;
  if (error) return <div className="page">{back}<ErrorBox error={error} onRetry={reload} /></div>;

  const a = p.asignacion;
  const ses = [...p.sesiones].reverse();
  const guardar = async () => { await api.guardarNota(p.id, nota); setGuardada(true); setTimeout(() => setGuardada(false), 2000); };
  const TABS = [["resumen", "Resumen"], ["sesiones", `Sesiones (${p.sesiones.length})`], ...(CAP.mensajes ? [["familia", "Familia", p.sinLeer]] : []), ["rutinas", "Rutinas"]];
  const mes = p.sesiones.filter((s) => new Date(s.fecha).getTime() >= Date.now() - 28 * 864e5).length;

  return (
    <div className="page">
      <PageHead back={back} eyebrow={`${p.edad ? `${p.edad} años · ` : ""}desde el ${fecha(p.inicio, { day: "numeric", month: "long" })}`} title={p.codigo}>
        <Link className="btn btn-line" to={`/pacientes/${p.id}/informe`}><Icon name="descargar" size={18} />Informe PDF</Link>
        <Link className="btn btn-navy" to={`/asignar?paciente=${p.id}`}><Icon name="asignar" size={18} />{a ? "Cambiar rutina" : "Asignar rutina"}</Link>
      </PageHead>
      <p className="lead-plan">{p.etiqueta}</p>

      <div className="tabs" role="tablist" aria-label="Secciones del paciente">
        {TABS.map(([k, t, n]) => (
          <button key={k} role="tab" id={`t-${k}`} aria-selected={tab === k} aria-controls={`p-${k}`} onClick={() => setTab(k)}>
            {t}{n > 0 && <span className="badge" aria-label={`${n} sin leer`}>{n}</span>}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <div id="p-resumen" role="tabpanel" aria-labelledby="t-resumen" className="grid-2">
          <section className="card hero-card span-2">
            <Cintas />
            <div className="hero-nums">
              {p.constancia != null
                ? <div className="big"><b>{p.constancia}<small>%</small></b><span>Constancia del mes</span></div>
                : <div className="big"><b>{mes}<small>{mes === 1 ? "sesión" : "sesiones"}</small></b><span>Últimas 4 semanas</span></div>}
              <div className="big"><b>{p.ritmoSemana ?? "—"}<small>/min</small></b><span>Aciertos por minuto (semana)</span></div>
              <div className="big"><b>{p.racha}<small>{p.racha === 1 ? "día" : "días"}</small></b><span>Racha actual</span></div>
            </div>
            <div className="hero-week">
              <p className="small-h">Últimos 7 días · {p.sesionesSemana}{p.objetivoSemanal ? ` de ${p.objetivoSemanal}` : ""} {p.sesionesSemana === 1 && !p.objetivoSemanal ? "sesión" : "sesiones"}</p>
              <Semana sesiones={p.sesiones} />
              <p className="muted small">Última sesión {haceCuanto(p.ultimaSesion)}{p.ultimoAnimo && <> · se sintió <Animo animo={p.ultimoAnimo} /></>}</p>
            </div>
            {p.pendientes > 0 && <p className="note-warn span-all"><Icon name="nube" size={16} />La consola tiene {p.pendientes} sesiones guardadas que todavía no se sincronizaron. Van a aparecer cuando vuelva a tener internet.</p>}
          </section>

          <Sugerencia p={p} onCambio={reload} />

          <section className="card span-2">
            <div className="card-head"><h2>Curva de progreso</h2><small className="muted">Aciertos por sesión</small></div>
            <CurvaProgreso sesiones={p.sesiones} marcas={p.historial} />
          </section>

          {CAP.metas && (
            <section className="card">
              <div className="card-head"><h2><Icon name="meta" size={18} />Objetivos terapéuticos</h2></div>
              <Metas p={p} onCambio={reload} />
            </section>
          )}

          {CAP.alcance && (
            <section className="card">
              <div className="card-head"><h2>Mapa de alcance</h2><small className="muted">Últimas 3 sesiones · así se ve la tele</small></div>
              <MapaAlcance puntos={p.alcance} mano={a?.bloques?.at(-1)?.config?.zona} />
            </section>
          )}

          <section className={`card ${CAP.notas || CAP.metas ? "" : "span-2"}`}>
            <div className="card-head"><h2>Rutina actual</h2>{a && <span className="pill pill-neutral">Versión {a.version}</span>}</div>
            <Rutina a={a} />
            {p.consola && <div className="row-between"><span className="meta"><Icon name="consola" size={14} />{p.consola.codigo}</span><EstadoConsola estado={p.consola.estado} /></div>}
          </section>

          {CAP.notas && <section className="card">
            <div className="card-head"><h2><Icon name="nota" size={18} />Notas del profesional</h2></div>
            <label className="sr" htmlFor="nota">Notas</label>
            <textarea id="nota" rows="5" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Observaciones para la próxima sesión…" />
            <small className="muted">Solo las ven profesionales con acceso a este paciente.</small>
            <div className="row-end">{guardada && <span className="saved" role="status"><Icon name="ok" size={16} />Guardado</span>}<button className="btn btn-line btn-sm" onClick={guardar} disabled={nota === (p.nota || "")}>Guardar nota</button></div>
          </section>}
        </div>
      )}

      {tab === "sesiones" && (
        <section id="p-sesiones" role="tabpanel" aria-labelledby="t-sesiones" className="card">
          {ses.length ? (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr">Sesiones del paciente {p.codigo}</caption>
                <thead><tr><th>Fecha</th><th>Duración</th><th>Aciertos</th><th>Por minuto</th>{CAP.animo && <th>Cómo se sintió</th>}<th>Estado</th></tr></thead>
                <tbody>
                  {ses.map((s) => (
                    <tr key={s.id}>
                      <td>{fecha(s.fecha, { weekday: "short", day: "numeric", month: "short" })} <span className="muted">{hora(s.fecha)}</span></td>
                      <td>{duracionTexto(s.duracionSeg)}{!s.completa && <small className="muted"> de {duracionTexto(s.duracionPlan)}</small>}</td>
                      <td><span className="score"><i style={{ width: `${Math.min(60, s.aciertos * 1.5)}px` }} />{s.aciertos}</span></td>
                      <td>{ritmo(s)}</td>
                      {CAP.animo && <td><Animo animo={s.animo} comentario={s.comentarioFamilia} />{s.comentarioFamilia && <small className="feel-c">“{s.comentarioFamilia}”</small>}</td>}
                      <td>{!s.sincronizada ? <span className="pill pill-warn"><Icon name="nube" size={14} stroke={2.4} />En la consola</span>
                        : s.completa ? <span className="pill pill-ok"><Icon name="ok" size={14} stroke={2.6} />Completa</span>
                        : <span className="pill pill-neutral"><Icon name="reloj" size={14} stroke={2.4} />Sin terminar</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon="objetivo" title="Todavía no hay sesiones" />}
        </section>
      )}

      {tab === "familia" && <div id="p-familia" role="tabpanel" aria-labelledby="t-familia"><Familia p={p} autor={profesional.nombre.split(" ")[0]} onCambio={reload} /></div>}

      {tab === "rutinas" && (
        <section id="p-rutinas" role="tabpanel" aria-labelledby="t-rutinas" className="card">
          {p.historial.length ? (
            <ol className="timeline">
              {p.historial.map((h, i) => (
                <li key={h.id} className={(h.estado ? h.estado === "active" : i === 0) ? "current" : ""}>
                  <b>Versión {h.version}{(h.estado ? h.estado === "active" : i === 0) && <span className="pill pill-ok">Actual</span>}</b>
                  <small>{fecha(h.creada, { day: "numeric", month: "long" })} · {h.consolaCodigo || h.consolaId}{h.dias ? ` · ${diasTexto(h.dias)}` : ""}</small>
                  {h.motivo && <span className="motivo">{h.motivo}</span>}
                  {h.bloques.map((b, j) => <span key={j}>{h.bloques.length > 1 ? `${j + 1}. ` : ""}{configTexto(b)}</span>)}
                </li>
              ))}
            </ol>
          ) : <Empty icon="asignar" title="Sin rutinas todavía" />}
        </section>
      )}
    </div>
  );
}
