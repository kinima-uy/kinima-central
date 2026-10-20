import { useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useData, haceCuanto } from "../lib/util.js";
import { PageHead, Loading, ErrorBox, Icon, EstadoConsola, Empty } from "../components/ui.jsx";

/* La credencial de una consola se muestra una sola vez: el servidor guarda solo su huella (hash). */
function Credencial({ consolaId, codigo, token, onCerrar }) {
  const [copiado, setCopiado] = useState("");
  const copiar = async (t, k) => { try { await navigator.clipboard.writeText(t); setCopiado(k); } catch { setCopiado(""); } };
  return (
    <section className="card cred" role="alertdialog" aria-labelledby="cred-h">
      <div className="card-head"><h2 id="cred-h"><Icon name="candado" size={18} />Credencial de {codigo}</h2></div>
      <p>Copiala ahora y cargala en el archivo privado de la consola. <b>No se vuelve a mostrar</b>; si se pierde, se genera una nueva.</p>
      <dl className="cred-kv">
        <div><dt>KINIMA_DEVICE_ID</dt><dd><code>{consolaId}</code><button type="button" className="link-btn" onClick={() => copiar(consolaId, "id")}>{copiado === "id" ? "Copiado" : "Copiar"}</button></dd></div>
        <div><dt>KINIMA_DEVICE_TOKEN</dt><dd><code>{token}</code><button type="button" className="link-btn" onClick={() => copiar(token, "tk")}>{copiado === "tk" ? "Copiado" : "Copiar"}</button></dd></div>
      </dl>
      <p className="muted small">No la mandes por chat ni la pegues en GitHub. Va solo en la Raspberry (ver raspberry/README.md).</p>
      <div className="row-end"><button className="btn btn-navy btn-sm" onClick={onCerrar}>Ya la guardé</button></div>
    </section>
  );
}

function NuevaConsola({ onListo, onCancelar }) {
  const [f, setF] = useState({ codigo: "", nombre: "" });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(f.codigo.trim()) || !f.nombre.trim()) { setError("Usá un código sin espacios (por ejemplo RPI-05) y un nombre corto."); return; }
    setEnviando(true); setError("");
    try { onListo(await api.crearConsola(f)); }
    catch (err) { setError(err.message); setEnviando(false); }
  };
  return (
    <form className="card new-form" onSubmit={enviar} noValidate>
      <div className="card-head"><h2>Registrar una consola</h2></div>
      <div className="meta-grid">
        <label className="field"><span>Código</span><input value={f.codigo} maxLength={40} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Ej.: RPI-05" autoFocus /></label>
        <label className="field"><span>Nombre</span><input value={f.nombre} maxLength={80} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Consola 05" /></label>
      </div>
      {error && <p className="form-error" role="alert"><Icon name="alerta" size={16} />{error}</p>}
      <div className="row-end"><button type="button" className="btn btn-line btn-sm" onClick={onCancelar}>Cancelar</button><button className="btn btn-navy btn-sm" disabled={enviando}>{enviando ? "Registrando…" : "Registrar y generar credencial"}</button></div>
    </form>
  );
}

export default function Consolas() {
  const { profesional } = useAuth();
  const admin = profesional.rol === "admin";
  const { data, error, loading, reload } = useData(api.getConsolas);
  const [nueva, setNueva] = useState(false);
  const [cred, setCred] = useState(null);
  const [busy, setBusy] = useState(null);
  const [aviso, setAviso] = useState("");

  const renovar = async (c) => {
    if (!window.confirm?.(`¿Generar una credencial nueva para ${c.codigo}? La actual deja de funcionar y hay que cargar la nueva en la consola.`)) return;
    setBusy(c.id);
    try { const r = await api.renovarToken(c.id); setCred({ consolaId: c.id, codigo: c.codigo, token: r.token }); }
    catch (e) { setAviso(e.message); }
    setBusy(null);
  };
  const quitar = async (c) => {
    setBusy(c.id);
    try { await api.quitarAsignacion(c.id); reload(); } catch (e) { setAviso(e.message); }
    setBusy(null);
  };

  return (
    <div className="page">
      <PageHead eyebrow="Dispositivos en casa" title="Consolas">
        {admin && !nueva && <button className="btn btn-navy" onClick={() => { setNueva(true); setCred(null); }}><Icon name="mas" size={18} />Registrar consola</button>}
      </PageHead>
      <p className="muted intro">Cada consola es una Raspberry Pi con cámara en la casa de un paciente. Guarda las sesiones aunque no tenga internet y las envía cuando se conecta.</p>
      {nueva && <NuevaConsola onCancelar={() => setNueva(false)} onListo={(r) => { setNueva(false); setCred({ consolaId: r.consola.id, codigo: r.consola.codigo, token: r.token }); reload(); }} />}
      {cred && <Credencial {...cred} onCerrar={() => setCred(null)} />}
      {aviso && <p className="form-error" role="alert"><Icon name="alerta" size={16} />{aviso}</p>}
      {loading && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && !data.length && <Empty icon="consola" title="Todavía no hay consolas">{admin ? "Registrá la primera consola para generar su credencial." : "Pedile a quien administra Kinima que te comparta una consola."}</Empty>}
      {data && data.length > 0 && (
        <ul className="consoles">
          {data.map((c) => (
            <li key={c.id} className="card ccard">
              <div className="row-between">
                <span className="cname"><span className="ex-ico" aria-hidden="true"><Icon name="consola" /></span><span><b>{c.codigo}</b>{c.nombre && c.nombre !== c.codigo && <small className="muted"> · {c.nombre}</small>}</span></span>
                <EstadoConsola estado={c.estado} />
              </div>
              <dl className="kv">
                <div><dt>Paciente</dt><dd>{c.pacienteId ? <Link to={`/pacientes/${c.pacienteId}`}>{c.pacienteCodigo || c.pacienteId}</Link> : "—"}</dd></div>
                <div><dt>Última conexión</dt><dd>{haceCuanto(c.ultimaSync)}</dd></div>
                <div><dt>Asignación</dt><dd>{c.asignacionVersion ? `Versión ${c.asignacionVersion}` : "—"}</dd></div>
                {c.version && <div><dt>Software</dt><dd>v{c.version}</dd></div>}
              </dl>
              {c.pendientes > 0 && <p className="note-warn"><Icon name="nube" size={16} />{c.pendientes} sesiones guardadas esperando conexión</p>}
              <div className="row-wrap">
                {!c.pacienteId && <Link className="btn btn-line btn-sm" to="/asignar">Asignar a un paciente</Link>}
                {c.pacienteId && <button className="btn btn-line btn-sm" disabled={busy === c.id} onClick={() => quitar(c)}>Quitar asignación</button>}
                {admin && <button className="link-btn" disabled={busy === c.id} onClick={() => renovar(c)}><Icon name="candado" size={16} />Nueva credencial</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
