import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../lib/brand.jsx";
import { Cintas, Personitas } from "../components/viz.jsx";
import { useAuth } from "../lib/auth.jsx";
import * as api from "../lib/api.js";
import { USING_MOCK } from "../lib/api.js";
import { Icon } from "../components/ui.jsx";

/* Primera vez: no existe ninguna cuenta administradora. Se crea con el código inicial (BOOTSTRAP_TOKEN de Vercel). */
function PrimeraCuenta({ onListo }) {
  const [f, setF] = useState({ bootstrapToken: "", nombre: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e) => {
    e.preventDefault();
    if (!f.bootstrapToken || f.nombre.trim().length < 2 || !f.email.trim() || f.password.length < 12) { setError("Completá todo. La contraseña necesita al menos 12 caracteres."); return; }
    setEnviando(true); setError("");
    try { onListo(await api.crearAdminInicial(f)); } catch (err) { setError(err.message); setEnviando(false); }
  };
  return (
    <form className="login-form" onSubmit={enviar} noValidate>
      <div className="login-mobile-logo"><Logo height={30} /></div>
      <p className="eyebrow">Primera vez</p>
      <h1>Crear la cuenta administradora</h1>
      <p className="muted">Todavía no hay ninguna cuenta. Usá el código inicial que está guardado en Vercel (BOOTSTRAP_TOKEN). Después conviene borrarlo de Vercel.</p>
      <label className="field"><span>Código inicial</span><input type="password" value={f.bootstrapToken} onChange={set("bootstrapToken")} autoComplete="off" /></label>
      <label className="field"><span>Nombre</span><input value={f.nombre} onChange={set("nombre")} autoComplete="name" /></label>
      <label className="field"><span>Mail</span><input type="email" value={f.email} onChange={set("email")} autoComplete="username" /></label>
      <label className="field"><span>Contraseña</span><input type="password" value={f.password} onChange={set("password")} autoComplete="new-password" placeholder="Mínimo 12 caracteres" /></label>
      {error && <p className="form-error" role="alert"><Icon name="alerta" size={16} />{error}</p>}
      <button className="btn btn-navy btn-block" disabled={enviando}>{enviando ? "Creando…" : "Crear cuenta e ingresar"}</button>
    </form>
  );
}

export default function Login() {
  const { profesional, entrar, iniciar } = useAuth();
  const [setup, setSetup] = useState(false);
  useEffect(() => { api.getSetupStatus().then((s) => setSetup(!!s.needsFirstAdmin)).catch(() => {}); }, []);
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [olvido, setOlvido] = useState(false);

  if (profesional) return <Navigate to={loc.state?.from || "/pacientes"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !pass) { setError("Completá tu mail y tu contraseña."); return; }
    setError(""); setCargando(true);
    try { await entrar(email, pass); nav(loc.state?.from || "/pacientes", { replace: true }); }
    catch (err) { setError(err.message); setCargando(false); }
  };

  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <Logo variant="crema" height={34} />
        <div className="login-iso">
          <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
          <Cintas className="login-cintas" />
          <Personitas />
        </div>
        <div>
          <p className="login-quote">Lo que pasa en casa, <em>a la vista</em> de quien acompaña la rehabilitación.</p>
          <p className="login-sub">Asigná ejercicios, seguí la constancia y ajustá la rutina de cada paciente.</p>
        </div>
      </section>

      <section className="login-form-wrap">
        {setup ? <PrimeraCuenta onListo={(s) => { iniciar(s); nav("/pacientes", { replace: true }); }} /> :
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-mobile-logo"><Logo height={30} /></div>
          <p className="eyebrow">Portal profesional</p>
          <h1>Iniciar sesión</h1>
          <p className="muted">Ingresá con la cuenta que te dio tu centro.</p>

          <label className="field">
            <span>Mail</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error && !email} placeholder="nombre@centro.uy" />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <span className="pass">
              <input type={ver ? "text" : "password"} autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} aria-invalid={!!error && !pass} />
              <button type="button" className="icon-btn" onClick={() => setVer(!ver)} aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={ver}><Icon name="ojo" size={18} /></button>
            </span>
          </label>

          {error && <p className="form-error" role="alert"><Icon name="alerta" size={16} />{error}</p>}

          <button className="btn btn-navy btn-block" disabled={cargando}>{cargando ? "Ingresando…" : <>Ingresar <Icon name="flecha" size={18} /></>}</button>
          <button type="button" className="link-btn" onClick={() => setOlvido(!olvido)} aria-expanded={olvido}>¿Olvidaste tu contraseña?</button>
          {olvido && <p className="hint">Por ahora, pedile a quien administra Kinima en tu centro que te genere una nueva.</p>}

          {USING_MOCK && (
            <div className="demo-box">
              <b>Datos de prueba</b>
              <span>Mail: <code>demo@kinima.uy</code></span>
              <span>Contraseña: <code>kinima2026</code></span>
              <button type="button" className="link-btn" onClick={() => { setEmail("demo@kinima.uy"); setPass("kinima2026"); }}>Completar automáticamente</button>
            </div>
          )}
          <p className="login-foot"><Icon name="candado" size={14} />Conexión segura · Solo profesionales autorizados</p>
        </form>}
      </section>
    </div>
  );
}
