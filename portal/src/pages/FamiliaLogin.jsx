import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../lib/brand.jsx";
import { Cintas, Personitas } from "../components/viz.jsx";
import { useAuthFamilia } from "../lib/authFamilia.jsx";
import { Icon } from "../components/ui.jsx";

export default function FamiliaLogin() {
  const { familia, entrar } = useAuthFamilia();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  if (familia) return <Navigate to={loc.state?.from || "/familia"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !pass) { setError("Completá tu mail y tu contraseña."); return; }
    setError(""); setCargando(true);
    try { await entrar(email, pass); nav(loc.state?.from || "/familia", { replace: true }); }
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
          <p className="login-quote">Lo que tu hijo o hija hace en casa, <em>a un click</em> de distancia.</p>
          <p className="login-sub">Mirá la rutina que le asignó su profesional y cómo le va sesión a sesión.</p>
        </div>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-mobile-logo"><Logo height={30} /></div>
          <p className="eyebrow">App para familias</p>
          <h1>Iniciar sesión</h1>
          <p className="muted">Ingresá con la cuenta que te dio el centro o profesional.</p>

          <label className="field">
            <span>Mail</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error && !email} placeholder="familia@mail.com" />
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
          <p className="hint">¿No tenés contraseña todavía? Pedísela al profesional que atiende a tu hijo o hija.</p>
          <p className="login-foot"><Icon name="candado" size={14} />Conexión segura · Acceso solo para familias autorizadas</p>
        </form>
      </section>
    </div>
  );
}
