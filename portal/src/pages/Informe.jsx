import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../lib/api.js";
import { useData, fecha } from "../lib/util.js";
import { Logo } from "../lib/brand.jsx";
import { Loading, ErrorBox, Icon } from "../components/ui.jsx";
import { CurvaProgreso, MapaAlcance } from "../components/viz.jsx";
import { Metas, Rutina } from "../components/clinica.jsx";
import { configTexto } from "../data/ejercicios.js";
import { ANIMOS } from "../data/ejercicios.js";
import { CAP } from "../lib/api.js";
import { ritmo, avg } from "../lib/modelo.js";

const DIA = 864e5;

/* Informe para la historia clínica, la familia o el centro. "Guardar como PDF" usa la impresión del navegador. */
export default function Informe() {
  const { id } = useParams();
  const { data: p, error, loading, reload } = useData(() => api.getPaciente(id), [id]);
  const [semanas, setSemanas] = useState(4);
  const [incluir, setIncluir] = useState({ notas: true, familia: true });

  if (loading && !p) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;

  const desde = Date.now() - semanas * 7 * DIA;
  const ses = p.sesiones.filter((s) => new Date(s.fecha).getTime() >= desde);
  const prom = avg(ses.map(ritmo));
  const minutosTot = Math.round(ses.reduce((t, s) => t + s.duracionSeg, 0) / 60);
  const esperadas = p.objetivoSemanal ? p.objetivoSemanal * semanas : null;
  const cambios = p.historial.filter((h) => new Date(h.creada).getTime() >= desde);
  const animos = Object.entries(ANIMOS).map(([k, a]) => [a, ses.filter((s) => s.animo === k).length]).filter(([, n]) => n);
  const comentarios = ses.filter((s) => s.comentarioFamilia);

  return (
    <div className="page informe-page">
      <div className="informe-bar no-print">
        <Link className="back" to={`/pacientes/${p.id}`}><Icon name="atras" size={16} />Volver a {p.codigo}</Link>
        <div className="informe-opts">
          <label className="field inline"><span>Período</span>
            <select value={semanas} onChange={(e) => setSemanas(+e.target.value)}>{[2, 4, 8, 12].map((n) => <option key={n} value={n}>Últimas {n} semanas</option>)}</select>
          </label>
          {CAP.notas && <label className="check"><input type="checkbox" checked={incluir.notas} onChange={(e) => setIncluir({ ...incluir, notas: e.target.checked })} />Incluir notas</label>}
          {CAP.animo && <label className="check"><input type="checkbox" checked={incluir.familia} onChange={(e) => setIncluir({ ...incluir, familia: e.target.checked })} />Incluir comentarios de la familia</label>}
          <button className="btn btn-navy" onClick={() => window.print()}><Icon name="descargar" size={18} />Guardar como PDF</button>
        </div>
        <p className="muted small">En la ventana de impresión elegí “Guardar como PDF” como destino.</p>
      </div>

      <article className="informe">
        <header className="inf-head">
          <Logo height={30} />
          <div>
            <h1>Informe de seguimiento · {p.codigo}</h1>
            <p>{p.edad ? `${p.edad} años · ` : ""}{p.etiqueta}</p>
            <p className="muted">{fecha(new Date(desde).toISOString(), { day: "numeric", month: "long" })} al {fecha(new Date().toISOString(), { day: "numeric", month: "long", year: "numeric" })}{p.profesional ? ` · ${p.profesional.nombre}${p.profesional.especialidad ? `, ${p.profesional.especialidad}` : ""}` : ""}</p>
          </div>
        </header>

        <section className="inf-nums">
          <div><b>{ses.length}{esperadas && <small>/{esperadas}</small>}</b><span>Sesiones realizadas</span></div>
          {esperadas ? <div><b>{Math.min(100, Math.round((ses.length / esperadas) * 100))}<small>%</small></b><span>Constancia</span></div>
            : <div><b>{ses.reduce((t, s) => t + s.aciertos, 0)}</b><span>Aciertos en total</span></div>}
          <div><b>{prom ?? "—"}<small>/min</small></b><span>Aciertos por minuto</span></div>
          <div><b>{minutosTot}<small>min</small></b><span>Tiempo de juego</span></div>
        </section>

        <section className="inf-sec">
          <h2>Curva de progreso</h2>
          <CurvaProgreso sesiones={ses} marcas={p.historial} fijo />
        </section>

        {(CAP.metas || CAP.alcance) && <div className="inf-cols">
          {CAP.metas && <section className="inf-sec">
            <h2>Objetivos terapéuticos</h2>
            <Metas p={p} soloLectura onCambio={() => {}} />
          </section>}
          {CAP.alcance && <section className="inf-sec">
            <h2>Mapa de alcance</h2>
            <MapaAlcance puntos={p.alcance} />
          </section>}
        </div>}

        <div className="inf-cols">
          <section className="inf-sec">
            <h2>Rutina actual</h2>
            <Rutina a={p.asignacion} />
          </section>
          <section className="inf-sec">
            <h2>Cambios de rutina en el período</h2>
            {cambios.length ? <ul className="inf-list">{cambios.map((c) => <li key={c.id}><b>{fecha(c.creada)} · v{c.version}</b> {c.motivo || configTexto(c.bloques[0])}</li>)}</ul> : <p className="muted">Sin cambios en este período.</p>}
          </section>
        </div>

        {incluir.familia && (animos.length > 0 || comentarios.length > 0) && (
          <section className="inf-sec">
            <h2>Cómo se sintió (según la familia)</h2>
            <p className="inf-animos">{animos.map(([a, n]) => <span key={a.t}>{a.emoji} {a.t}: <b>{n}</b></span>)}</p>
            {comentarios.length > 0 && <ul className="inf-list">{comentarios.map((s) => <li key={s.id}><b>{fecha(s.fecha)}</b> “{s.comentarioFamilia}”</li>)}</ul>}
          </section>
        )}

        {incluir.notas && p.nota && (
          <section className="inf-sec">
            <h2>Notas del profesional</h2>
            <p>{p.nota}</p>
          </section>
        )}

        <footer className="inf-foot">Generado con Kinima · portal.kinima.uy · {fecha(new Date().toISOString(), { day: "numeric", month: "long", year: "numeric" })}. El paciente se identifica con un código interno. Documento confidencial.</footer>
      </article>
    </div>
  );
}
