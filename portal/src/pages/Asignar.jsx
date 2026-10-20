import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import * as api from "../lib/api.js";
import { CAP } from "../lib/api.js";
import { configTexto, duracionTexto } from "../data/ejercicios.js";
import { useAuth } from "../lib/auth.jsx";
import { useData } from "../lib/util.js";
import { PageHead, Loading, ErrorBox, Icon, EstadoConsola } from "../components/ui.jsx";
import { DIAS, diasTexto, ej } from "../components/clinica.jsx";

const PASOS = ["Paciente", "Rutina", "Consola", "Confirmar"];
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
const MAX_BLOQUES = CAP.maxBloques;
const nuevoBloque = (e) => ({ ejercicioId: e.id, config: Object.fromEntries(e.campos.map((c) => [c.id, c.defecto])) });

function Campo({ c, value, onChange, name }) {
  if (c.tipo === "numero") return (
    <label className="cfield">
      <span className="cl">{c.label}<b>{c.unidad === "s" ? duracionTexto(value) : `${value}${c.unidad ? ` ${c.unidad}` : ""}`}</b></span>
      <input type="range" min={c.min} max={c.max} step={c.paso} value={value} onChange={(e) => onChange(+e.target.value)}
        style={{ "--p": `${((value - c.min) / (c.max - c.min)) * 100}%` }} />
    </label>
  );
  return (
    <fieldset className="cfield">
      <legend className="cl">{c.label}</legend>
      <div className="seg">
        {c.opciones.map((o) => (
          <label key={o} className={value === o ? "on" : ""}><input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} />{o}</label>
        ))}
      </div>
    </fieldset>
  );
}

export default function Asignar() {
  const { profesional } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { data, error, loading, reload } = useData(() => Promise.all([api.getPacientes(profesional.id), api.getEjercicios(), api.getConsolas(), api.getPlantillas()]), [profesional.id]);
  const [paso, setPaso] = useState(params.get("paciente") ? 1 : 0);
  const [pacienteId, setPacienteId] = useState(params.get("paciente") || "");
  const [dias, setDias] = useState([1, 3, 5]);
  const [bloques, setBloques] = useState([]);
  const [consolaId, setConsolaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(null);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [plantillas, setPlantillas] = useState([]);
  const [plNombre, setPlNombre] = useState("");
  const [plGuardada, setPlGuardada] = useState("");
  const [plAbierta, setPlAbierta] = useState(false);

  const [pacientes, ejercicios, consolas] = data || [[], [], []];
  const disponibles = ejercicios.filter((e) => e.disponible);
  const paciente = pacientes.find((p) => p.id === pacienteId);
  useEffect(() => { if (data) setPlantillas(data[3]); }, [data]);

  /* Al elegir paciente se precarga su rutina y su consola actuales. */
  useEffect(() => {
    if (!data) return;
    const a = paciente?.asignacion;
    setDias(a?.dias || [1, 3, 5]);
    setBloques(a ? structuredClone(a.bloques).slice(0, MAX_BLOQUES) : disponibles[0] ? [nuevoBloque(disponibles[0])] : []);
    setConsolaId(paciente?.consola?.id || "");
  }, [paciente?.id, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const consola = consolas.find((c) => c.id === consolaId);
  const ocupada = useMemo(() => Object.fromEntries(consolas.map((c) => [c.id, c.pacienteId && c.pacienteId !== pacienteId ? c.pacienteId : null])), [consolas, pacienteId]);
  const puedeSeguir = [!!paciente, (!CAP.dias || dias.length > 0) && bloques.length > 0, !!consolaId, true][paso];
  const codigo = (id) => pacientes.find((p) => p.id === id)?.codigo || consolas.find((c) => c.pacienteId === id)?.pacienteCodigo || "otro paciente";

  const setCfg = (i, k, v) => setBloques((bs) => bs.map((b, j) => (j === i ? { ...b, config: { ...b.config, [k]: v } } : b)));
  const toggleDia = (d) => setDias((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));
  const usarPlantilla = (id) => { const pl = plantillas.find((x) => x.id === id); if (pl) { setDias(pl.dias); setBloques(structuredClone(pl.bloques)); } };
  const guardarPlantilla = async () => {
    if (!plNombre.trim()) return;
    const pl = await api.guardarPlantilla({ nombre: plNombre.trim(), dias, bloques });
    setPlantillas((l) => [...l, pl]); setPlGuardada(pl.nombre); setPlNombre(""); setPlAbierta(false);
  };
  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await api.crearAsignacion({ pacienteId, consolaId, dias: CAP.dias ? dias : null, bloques, motivo: paciente?.asignacion ? "Cambio de rutina" : "Inicio" });
      setEnviando(false); setListo(r);
    } catch (err) { setEnviando(false); setErrorEnvio(err.message); }
  };

  if (loading && !data) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;

  if (listo) return (
    <div className="page">
      <div className="card done-card">
        <span className="done-ico"><Icon name="ok" size={34} stroke={2.6} /></span>
        <h1>Rutina enviada</h1>
        <p>La consola <b>{consola?.codigo}</b> va a recibir la versión {listo.version} para <b>{paciente?.codigo}</b> la próxima vez que se conecte. Si no tiene internet, sigue usando la rutina anterior hasta sincronizar.</p>
        <div className="row-center">
          <Link className="btn btn-navy" to={`/pacientes/${pacienteId}`}>Ver paciente</Link>
          <button className="btn btn-line" onClick={() => { setListo(null); setPaso(0); setPacienteId(""); }}>Asignar otra rutina</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page">
      <PageHead eyebrow="Nueva asignación" title="Armar una rutina" />
      <ol className="stepper" aria-label="Pasos">
        {PASOS.map((t, i) => (
          <li key={t} className={i === paso ? "now" : i < paso ? "past" : ""} aria-current={i === paso ? "step" : undefined}>
            <button type="button" disabled={i > paso} onClick={() => setPaso(i)}><span>{i < paso ? <Icon name="ok" size={14} stroke={3} /> : i + 1}</span>{t}</button>
          </li>
        ))}
      </ol>

      <div className="assign">
        <section className="card">
          {paso === 0 && (
            <fieldset className="choices">
              <legend>¿Para qué paciente?</legend>
              {pacientes.map((p) => (
                <label key={p.id} className={`choice ${pacienteId === p.id ? "on" : ""}`}>
                  <input type="radio" name="pac" value={p.id} checked={pacienteId === p.id} onChange={() => setPacienteId(p.id)} />
                  <span className="pcode sm" aria-hidden="true">{p.codigo.slice(-2)}</span>
                  <span><b>{p.codigo}</b><small>{p.edad ? `${p.edad} años · ` : ""}{p.etiqueta}</small></span>
                </label>
              ))}
            </fieldset>
          )}

          {paso === 1 && (
            <div className="rutina-form">
              <div className="pl-row">
                {CAP.plantillas && <label className="field pl-select">
                  <span><Icon name="plantilla" size={16} /> Empezar desde una plantilla</span>
                  <select defaultValue="" onChange={(e) => usarPlantilla(e.target.value)}>
                    <option value="" disabled>Elegir plantilla…</option>
                    {plantillas.map((pl) => <option key={pl.id} value={pl.id}>{pl.nombre}</option>)}
                  </select>
                </label>}
                <Link className="link-btn" to="/ejercicios"><Icon name="libro" size={16} /> Ver biblioteca de ejercicios</Link>
              </div>

              {CAP.dias && <fieldset>
                <legend>Días de la semana</legend>
                <div className="dias big-dias">
                  {ORDEN_DIAS.map((d) => (
                    <label key={d} className={dias.includes(d) ? "on" : ""}>
                      <input type="checkbox" checked={dias.includes(d)} onChange={() => toggleDia(d)} />
                      <span aria-hidden="true">{DIAS[d]}</span><span className="sr">{["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][d]}</span>
                    </label>
                  ))}
                </div>
                <small className="muted">{dias.length ? `${diasTexto(dias)} · ${dias.length} ${dias.length === 1 ? "vez" : "veces"} por semana` : "Elegí al menos un día"}</small>
              </fieldset>}

              <div className="bloques-edit">
                <h2>{MAX_BLOQUES > 1 ? "Ejercicios de la rutina" : "Ejercicio y configuración"}</h2>
                {bloques.map((b, i) => (
                  <div className="bloque" key={i}>
                    <div className="bloque-head">
                      <span className="bnum" aria-hidden="true">{i + 1}</span>
                      <label className="sr" htmlFor={`ej-${i}`}>Ejercicio {i + 1}</label>
                      <select id={`ej-${i}`} value={b.ejercicioId} onChange={(e) => setBloques((bs) => bs.map((x, j) => (j === i ? nuevoBloque(ejercicios.find((y) => y.id === e.target.value)) : x)))}>
                        {ejercicios.map((e) => <option key={e.id} value={e.id} disabled={!e.disponible}>{e.nombre}{e.disponible ? "" : " (próximamente)"}</option>)}
                      </select>
                      {bloques.length > 1 && <button type="button" className="icon-btn sm" onClick={() => setBloques((bs) => bs.filter((_, j) => j !== i))} aria-label={`Quitar ejercicio ${i + 1}`}><Icon name="basura" size={18} /></button>}
                    </div>
                    <div className="config">
                      {ej(b.ejercicioId)?.campos.map((c) => <Campo key={c.id} c={c} name={`${c.id}-${i}`} value={b.config[c.id]} onChange={(v) => setCfg(i, c.id, v)} />)}
                    </div>
                  </div>
                ))}
                {bloques.length < MAX_BLOQUES && disponibles[0] && (
                  <button type="button" className="add-bloque" onClick={() => setBloques((bs) => [...bs, nuevoBloque(disponibles[0])])}><Icon name="mas" size={18} />Agregar otro ejercicio</button>
                )}
              </div>

              {!CAP.dias && <p className="muted small">La consola usa esta configuración cada vez que el niño juega, hasta que la cambies.</p>}
              {CAP.plantillas && <div className="pl-save">
                {plAbierta ? (
                  <div className="pl-save-row">
                    <label className="sr" htmlFor="pln">Nombre de la plantilla</label>
                    <input id="pln" value={plNombre} onChange={(e) => setPlNombre(e.target.value)} placeholder="Nombre de la plantilla" />
                    <button type="button" className="btn btn-navy btn-sm" onClick={guardarPlantilla} disabled={!plNombre.trim()}>Guardar</button>
                    <button type="button" className="btn btn-line btn-sm" onClick={() => setPlAbierta(false)}>Cancelar</button>
                  </div>
                ) : <button type="button" className="link-btn" onClick={() => { setPlAbierta(true); setPlGuardada(""); }}><Icon name="plantilla" size={16} /> Guardar esta rutina como plantilla</button>}
                {plGuardada && <span className="saved" role="status"><Icon name="ok" size={16} />Plantilla “{plGuardada}” guardada</span>}
              </div>}
            </div>
          )}

          {paso === 2 && (
            <fieldset className="choices">
              <legend>¿En qué consola?</legend>
              {consolas.map((c) => (
                <label key={c.id} className={`choice ${consolaId === c.id ? "on" : ""}`}>
                  <input type="radio" name="con" value={c.id} checked={consolaId === c.id} onChange={() => setConsolaId(c.id)} />
                  <span className="ex-ico" aria-hidden="true"><Icon name="consola" /></span>
                  <span><b>{c.codigo}</b><small>{ocupada[c.id] ? `Hoy la usa ${codigo(ocupada[c.id])} · se le quitará` : c.pacienteId === pacienteId ? "Es la consola actual de este paciente" : "Libre"}</small></span>
                  <EstadoConsola estado={c.estado} />
                </label>
              ))}
            </fieldset>
          )}

          {paso === 3 && (
            <div className="confirm">
              <h2>Revisá antes de enviar</h2>
              <dl className="kv cols">
                <div><dt>Paciente</dt><dd>{paciente?.codigo}</dd></div>
                <div><dt>Consola</dt><dd>{consola?.codigo}</dd></div>
                {CAP.dias && <div><dt>Días</dt><dd>{diasTexto(dias)}</dd></div>}
              </dl>
              <ol className="bloques">
                {bloques.map((b, i) => (
                  <li key={i}><span className="bnum" aria-hidden="true">{i + 1}</span><div><b>{ej(b.ejercicioId)?.nombre}</b><small>{configTexto(b)}</small></div></li>
                ))}
              </ol>
              {consola?.estado === "sin_conexion" && <p className="note-warn"><Icon name="sinwifi" size={16} />Esta consola está sin conexión. La va a recibir cuando vuelva a tener internet.</p>}
              {ocupada[consolaId] && <p className="note-warn"><Icon name="alerta" size={16} />{codigo(ocupada[consolaId])} va a quedar sin consola asignada.</p>}
              {paciente?.consola && paciente.consola.id !== consolaId && <p className="note-warn"><Icon name="alerta" size={16} />{paciente.consola.codigo} deja de tener asignado a {paciente.codigo}.</p>}
              {errorEnvio && <p className="form-error" role="alert"><Icon name="alerta" size={16} />{errorEnvio}</p>}
            </div>
          )}

          <div className="wizard-nav">
            {paso > 0 ? <button className="btn btn-line" onClick={() => setPaso(paso - 1)}><Icon name="atras" size={18} />Atrás</button> : <span />}
            {paso < 3
              ? <button className="btn btn-navy" disabled={!puedeSeguir} onClick={() => setPaso(paso + 1)}>Continuar<Icon name="flecha" size={18} /></button>
              : <button className="btn btn-navy" disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : "Enviar a la consola"}</button>}
          </div>
        </section>

        <aside className="card summary" aria-label="Resumen">
          <h2>Resumen</h2>
          <dl className="kv">
            <div><dt>Paciente</dt><dd>{paciente?.codigo || "—"}</dd></div>
            {CAP.dias && <div><dt>Días</dt><dd>{paso >= 1 && dias.length ? diasTexto(dias) : "—"}</dd></div>}
            <div><dt>{MAX_BLOQUES > 1 ? "Ejercicios" : "Ejercicio"}</dt><dd>{paso >= 1 ? (MAX_BLOQUES > 1 ? bloques.length : configTexto(bloques[0] || {}) || "—") : "—"}</dd></div>
            <div><dt>Consola</dt><dd>{paso >= 2 && consola ? consola.codigo : "—"}</dd></div>
          </dl>
          <p className="muted small">La consola consulta al servidor al iniciarse y al sincronizar. Guarda la última rutina para poder usarla sin internet.</p>
        </aside>
      </div>
      <button className="link-btn" onClick={() => nav(-1)}>Cancelar</button>
    </div>
  );
}
