/* Piezas clínicas del portal: sugerencias, objetivos terapéuticos, familia y rutina. */
import { useEffect, useRef, useState } from "react";
import * as api from "../lib/api.js";
import { fecha, hora } from "../lib/util.js";
import { ANIMOS, ej, configTexto } from "../data/ejercicios.js";
import { Icon, Empty } from "./ui.jsx";

export const DIAS = ["D", "L", "M", "M", "J", "V", "S"];
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export { ej };
export const diasTexto = (dias) => (dias.length === 7 ? "Todos los días" : [1, 2, 3, 4, 5, 6, 0].filter((d) => dias.includes(d)).map((d) => DIAS_LARGO[d].slice(0, 3)).join(" · "));

export function Animo({ animo, comentario, compacto }) {
  if (!animo) return <span className="muted">—</span>;
  const a = ANIMOS[animo];
  return (
    <span className={`animo animo-${animo}`} title={comentario || a.t}>
      <span aria-hidden="true">{a.emoji}</span>{!compacto && a.t}{compacto && <span className="sr">{a.t}</span>}
    </span>
  );
}

/* ---------- 1. Sugerencia de ajuste ---------- */
export function Sugerencia({ p, onCambio }) {
  const [estado, setEstado] = useState(null);
  const s = p.sugerencia;
  if (!s) return null;
  const aplicar = async () => { setEstado("aplicando"); await api.aplicarSugerencia(p.id); setEstado("ok"); setTimeout(onCambio, 900); };
  const descartar = async () => { await api.descartarSugerencia(p.id); onCambio(); };
  return (
    <section className={`card sug sug-${s.tipo} span-2`} aria-live="polite">
      <span className="sug-ico"><Icon name="idea" size={24} /></span>
      <div className="sug-txt">
        <p className="eyebrow">Sugerencia de Kinima</p>
        <h2>{s.titulo}</h2>
        <p>{s.texto}</p>
        <small className="muted">Vos decidís: nada cambia hasta que la apliques.</small>
      </div>
      <div className="sug-actions">
        {estado === "ok"
          ? <span className="saved"><Icon name="ok" size={18} />Aplicada · se envía a la consola</span>
          : <>
              <button className="btn btn-navy btn-sm" onClick={aplicar} disabled={estado === "aplicando"}>{estado === "aplicando" ? "Aplicando…" : "Aplicar"}</button>
              <button className="btn btn-line btn-sm" onClick={descartar}>Ahora no</button>
            </>}
      </div>
    </section>
  );
}

/* ---------- 2. Objetivos terapéuticos ---------- */
const METRICAS = [["ritmo", "Aciertos por minuto"], ["constancia", "Constancia del mes (%)"], ["zona", "Alcance en una zona (%)"]];
export function Metas({ p, onCambio, soloLectura }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ texto: "", metrica: "ritmo", zona: "Arriba izq.", objetivo: 10, semanas: 4 });
  const guardar = async (e) => {
    e.preventDefault();
    if (!f.texto.trim()) return;
    const lim = new Date(); lim.setDate(lim.getDate() + f.semanas * 7);
    const base = f.metrica === "constancia" ? (p.constancia ?? 0) : f.metrica === "ritmo" ? (p.ritmoSemana ?? 0) : 0;
    await api.agregarMeta({ pacienteId: p.id, texto: f.texto.trim(), metrica: f.metrica, zona: f.metrica === "zona" ? f.zona : undefined, base, objetivo: +f.objetivo, fechaLimite: lim.toISOString() });
    setAbierto(false); setF({ ...f, texto: "" }); onCambio();
  };
  const borrar = async (id) => { await api.borrarMeta(id); onCambio(); };

  return (
    <>
      {p.metas.length ? (
        <ul className="metas">
          {p.metas.map((m) => (
            <li key={m.id} className={m.lograda ? "ok" : ""}>
              <div className="meta-top">
                <span className="meta-ico" aria-hidden="true"><Icon name={m.lograda ? "ok" : "meta"} size={16} stroke={2.4} /></span>
                <b>{m.texto}</b>
                {!soloLectura && <button className="icon-btn sm" onClick={() => borrar(m.id)} aria-label={`Quitar objetivo: ${m.texto}`}><Icon name="basura" size={16} /></button>}
              </div>
              <div className="bar" role="progressbar" aria-valuenow={m.avance} aria-valuemin="0" aria-valuemax="100" aria-label={`Avance: ${m.avance}%`}><i style={{ width: `${m.avance}%` }} /></div>
              <div className="meta-foot">
                <span><b>{m.actual}{m.unidad}</b> de {m.objetivo}{m.unidad}{m.zona ? ` · ${m.zona}` : ""}</span>
                <span className="muted">{m.lograda ? "¡Lograda!" : `Hasta el ${fecha(m.fechaLimite, { day: "numeric", month: "short" })}`}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty icon="meta" title="Sin objetivos todavía">Definí una meta medible para seguir el avance.</Empty>}

      {!soloLectura && (abierto ? (
        <form className="meta-form" onSubmit={guardar}>
          <label className="field"><span>Objetivo</span><input value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Ej.: alcanzar objetivos del lado izquierdo" required /></label>
          <div className="meta-grid">
            <label className="field"><span>Se mide con</span>
              <select value={f.metrica} onChange={(e) => setF({ ...f, metrica: e.target.value })}>{METRICAS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
            </label>
            {f.metrica === "zona" && (
              <label className="field"><span>Zona</span>
                <select value={f.zona} onChange={(e) => setF({ ...f, zona: e.target.value })}>{Object.keys(api.ZONAS).map((z) => <option key={z}>{z}</option>)}</select>
              </label>
            )}
            <label className="field"><span>{f.metrica === "ritmo" ? "Meta (aciertos/min)" : "Meta (%)"}</span><input type="number" min="1" max={f.metrica === "ritmo" ? 60 : 100} value={f.objetivo} onChange={(e) => setF({ ...f, objetivo: e.target.value })} /></label>
            <label className="field"><span>Plazo</span>
              <select value={f.semanas} onChange={(e) => setF({ ...f, semanas: +e.target.value })}>{[2, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n} semanas</option>)}</select>
            </label>
          </div>
          <div className="row-end"><button type="button" className="btn btn-line btn-sm" onClick={() => setAbierto(false)}>Cancelar</button><button className="btn btn-navy btn-sm">Guardar objetivo</button></div>
        </form>
      ) : <button className="link-btn add" onClick={() => setAbierto(true)}><Icon name="mas" size={16} />Agregar objetivo</button>)}
    </>
  );
}

/* ---------- 3. Familia: mensajes y cómo se sintió ---------- */
export function Familia({ p, autor, onCambio }) {
  const [texto, setTexto] = useState("");
  const [lista, setLista] = useState(p.mensajes);
  const [enviando, setEnviando] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { if (p.sinLeer) api.marcarLeidos(p.id).then(onCambio); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [lista.length]);
  const enviar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    const m = await api.enviarMensaje(p.id, texto.trim(), autor);
    setLista((l) => [...l, m]); setTexto(""); setEnviando(false);
  };
  const conAnimo = [...p.sesiones].reverse().filter((s) => s.animo).slice(0, 6);

  return (
    <div className="grid-2 familia">
      <section className="card chat-card">
        <div className="card-head"><h2><Icon name="mensaje" size={18} />Mensajes con la familia</h2><small className="muted">Les llegan a la app familiar</small></div>
        <ol className="chat" aria-live="polite">
          {lista.map((m) => (
            <li key={m.id} className={m.de}>
              <div className="bubble"><p>{m.texto}</p></div>
              <small>{m.de === "familia" ? "Familia" : m.autor} · {fecha(m.fecha)} {hora(m.fecha)}</small>
            </li>
          ))}
          <li ref={endRef} aria-hidden="true" className="end" />
        </ol>
        <form className="composer" onSubmit={enviar}>
          <label className="sr" htmlFor="msg">Escribir mensaje</label>
          <textarea id="msg" rows="2" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribí un mensaje para la familia…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) enviar(e); }} />
          <button className="btn btn-navy" disabled={!texto.trim() || enviando} aria-label="Enviar mensaje"><Icon name="enviar" size={18} /></button>
        </form>
      </section>
      <section className="card">
        <div className="card-head"><h2>Cómo se sintió</h2><small className="muted">Lo marca la familia después de jugar</small></div>
        {conAnimo.length ? (
          <ul className="feel">
            {conAnimo.map((s) => (
              <li key={s.id} className={`feel-${s.animo}`}>
                <span className="feel-emoji" aria-hidden="true">{ANIMOS[s.animo].emoji}</span>
                <div><b>{ANIMOS[s.animo].t}</b><small>{fecha(s.fecha, { weekday: "short", day: "numeric", month: "short" })} · {s.aciertos} aciertos</small>{s.comentarioFamilia && <p>“{s.comentarioFamilia}”</p>}</div>
              </li>
            ))}
          </ul>
        ) : <Empty icon="mensaje" title="Todavía no hay respuestas" />}
      </section>
    </div>
  );
}

/* ---------- 4. Rutina actual ---------- */
export function Rutina({ a }) {
  if (!a) return <Empty icon="asignar" title="Sin rutina">Asignale una rutina y una consola para que pueda empezar en casa.</Empty>;
  return (
    <div className="rutina">
      {a.dias && (
        <div className="dias" aria-label={`Días: ${diasTexto(a.dias)}`}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => <span key={d} className={a.dias.includes(d) ? "on" : ""} aria-hidden="true">{DIAS[d]}</span>)}
        </div>
      )}
      <ol className="bloques">
        {a.bloques.map((b, i) => (
          <li key={i}>
            <span className="bnum" aria-hidden="true">{i + 1}</span>
            <div>
              <b>{ej(b.ejercicioId)?.nombre}</b>
              <small>{configTexto(b)}</small>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
