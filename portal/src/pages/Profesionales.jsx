import { useState } from "react";
import * as api from "../lib/api.js";
import { CAP } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useData } from "../lib/util.js";
import { PageHead, Loading, ErrorBox, Icon } from "../components/ui.jsx";

/* Alta de profesional. La contraseña inicial la elige quien administra y se la pasa por un canal privado. */
function NuevoProfesional({ onListo, onCancelar }) {
  const [f, setF] = useState({ nombre: "", email: "", password: "", rol: "profesional" });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (f.nombre.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) || f.password.length < 12) { setError("Completá nombre y mail. La contraseña necesita al menos 12 caracteres."); return; }
    setEnviando(true); setError("");
    try { onListo(await api.crearProfesional(f)); }
    catch (err) { setError(err.message); setEnviando(false); }
  };
  return (
    <form className="card new-form" onSubmit={enviar} noValidate>
      <div className="card-head"><h2>Nueva cuenta</h2></div>
      <div className="meta-grid">
        <label className="field"><span>Nombre</span><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus /></label>
        <label className="field"><span>Mail</span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="nombre@centro.uy" /></label>
        <label className="field"><span>Contraseña inicial</span><input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Mínimo 12 caracteres" autoComplete="new-password" /></label>
        <label className="field"><span>Rol</span><select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}><option value="profesional">Profesional</option><option value="admin">Administrador</option></select></label>
      </div>
      {error && <p className="form-error" role="alert"><Icon name="alerta" size={16} />{error}</p>}
      <div className="row-end"><button type="button" className="btn btn-line btn-sm" onClick={onCancelar}>Cancelar</button><button className="btn btn-navy btn-sm" disabled={enviando}>{enviando ? "Creando…" : "Crear cuenta"}</button></div>
    </form>
  );
}

/* Qué pacientes y consolas ve cada profesional. Quien administra ve todo. */
function Accesos({ p, accesos, pacientes, consolas, onCambio }) {
  const [busy, setBusy] = useState(false);
  const mios = accesos.pacientes.filter((a) => a.profesionalId === p.id);
  const misCon = accesos.consolas.filter((a) => a.profesionalId === p.id);
  const hacer = async (fn) => { setBusy(true); try { await fn(); await onCambio(); } finally { setBusy(false); } };
  const libresP = pacientes.filter((x) => !mios.some((a) => a.pacienteId === x.id));
  const libresC = consolas.filter((x) => !misCon.some((a) => a.consolaId === x.id));
  return (
    <div className="accesos">
      <div>
        <p className="small-h">Pacientes</p>
        <div className="chips-list">
          {mios.map((a) => <span key={a.pacienteId} className="chip">{a.codigo}<button type="button" disabled={busy} onClick={() => hacer(() => api.quitarAccesoPaciente(a.pacienteId, p.id))} aria-label={`Quitar acceso a ${a.codigo}`}><Icon name="cerrar" size={14} /></button></span>)}
          {!mios.length && <span className="muted small">Ninguno</span>}
          {libresP.length > 0 && <select aria-label={`Compartir un paciente con ${p.nombre}`} value="" disabled={busy} onChange={(e) => e.target.value && hacer(() => api.darAccesoPaciente(e.target.value, p.id))}>
            <option value="">+ Compartir paciente</option>{libresP.map((x) => <option key={x.id} value={x.id}>{x.codigo}</option>)}
          </select>}
        </div>
      </div>
      <div>
        <p className="small-h">Consolas</p>
        <div className="chips-list">
          {misCon.map((a) => <span key={a.consolaId} className="chip">{a.codigo}<button type="button" disabled={busy} onClick={() => hacer(() => api.quitarAccesoConsola(a.consolaId, p.id))} aria-label={`Quitar acceso a ${a.codigo}`}><Icon name="cerrar" size={14} /></button></span>)}
          {!misCon.length && <span className="muted small">Ninguna</span>}
          {libresC.length > 0 && <select aria-label={`Compartir una consola con ${p.nombre}`} value="" disabled={busy} onChange={(e) => e.target.value && hacer(() => api.darAccesoConsola(e.target.value, p.id))}>
            <option value="">+ Compartir consola</option>{libresC.map((x) => <option key={x.id} value={x.id}>{x.codigo}</option>)}
          </select>}
        </div>
      </div>
    </div>
  );
}

export default function Profesionales() {
  const { profesional: yo } = useAuth();
  const { data, error, loading, reload } = useData(() => Promise.all([api.getProfesionales(), api.getAccesos(), api.getPacientes(), api.getConsolas()]));
  const [busy, setBusy] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [creado, setCreado] = useState("");
  const [abierto, setAbierto] = useState(null);
  const toggle = async (p) => { setBusy(p.id); await api.setProfesionalActivo(p.id, !p.activo); setBusy(null); reload(); };
  const [pros, accesos, pacientes, consolas] = data || [];

  return (
    <div className="page">
      <PageHead eyebrow="Administración" title="Profesionales">
        {!nuevo && <button className="btn btn-navy" onClick={() => { setNuevo(true); setCreado(""); }}><Icon name="mas" size={18} />Nueva cuenta</button>}
      </PageHead>
      <p className="muted intro">Cada profesional ve los pacientes que creó y los que le compartas acá. Para asignar rutinas también necesita acceso a la consola.</p>
      {nuevo && <NuevoProfesional onCancelar={() => setNuevo(false)} onListo={(p) => { setNuevo(false); setCreado(`Se creó la cuenta de ${p.nombre}. Pasale su contraseña inicial por un canal privado.`); reload(); }} />}
      {creado && <p className="saved" role="status"><Icon name="ok" size={16} />{creado}</p>}
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {pros && (
        <ul className="people card">
          {pros.map((p) => (
            <li key={p.id} className="person">
              <div className="person-row">
                <span className={`avatar ${p.activo ? "" : "off"}`} aria-hidden="true">{p.nombre.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
                <div className="pinfo">
                  <b>{p.nombre}{p.rol === "admin" && <span className="pill pill-neutral">Admin</span>}{p.id === yo.id && <span className="pill pill-neutral">Vos</span>}</b>
                  <small>{p.especialidad ? `${p.especialidad} · ` : ""}{p.email}</small>
                </div>
                {p.rol !== "admin" && <button className="link-btn" aria-expanded={abierto === p.id} onClick={() => setAbierto(abierto === p.id ? null : p.id)}>Accesos</button>}
                {CAP.desactivarProfesional && <span className={`pill ${p.activo ? "pill-ok" : "pill-neutral"}`}><Icon name={p.activo ? "ok" : "candado"} size={14} stroke={2.4} />{p.activo ? "Con acceso" : "Sin acceso"}</span>}
                {CAP.desactivarProfesional && p.id !== yo.id && (
                  <button className="btn btn-line btn-sm" disabled={busy === p.id} onClick={() => toggle(p)}>{p.activo ? "Retirar acceso" : "Habilitar"}</button>
                )}
              </div>
              {abierto === p.id && <Accesos p={p} accesos={accesos} pacientes={pacientes} consolas={consolas} onCambio={reload} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
