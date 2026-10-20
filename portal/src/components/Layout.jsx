import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Logo } from "../lib/brand.jsx";
import { useAuth } from "../lib/auth.jsx";
import { USING_MOCK } from "../lib/api.js";
import { Icon } from "./ui.jsx";

export default function Layout() {
  const { profesional, salir } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); document.getElementById("main")?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [open]);

  const nav = [
    ["/pacientes", "Pacientes", "pacientes"],
    ["/asignar", "Nueva rutina", "asignar"],
    ["/ejercicios", "Ejercicios", "libro"],
    ["/consolas", "Consolas", "consola"],
    ...(profesional.rol === "admin" ? [["/profesionales", "Profesionales", "equipo"]] : []),
  ];
  const iniciales = profesional.nombre.split(" ").map((p) => p[0]).slice(0, 2).join("");

  return (
    <div className="app">
      <a className="skip" href="#main">Saltar al contenido</a>
      <header className="topbar">
        <button className="icon-btn" aria-label="Abrir menú" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
        <Logo height={26} />
        <span className="avatar sm" aria-hidden="true">{iniciales}</span>
      </header>
      <div className={`scrim ${open ? "on" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="sidebar" className={`sidebar ${open ? "open" : ""}`} aria-label="Menú principal">
        <div className="sb-top">
          <Logo variant="crema" height={30} />
          <span className="sb-tag">Portal profesional</span>
          <button className="icon-btn sb-close" aria-label="Cerrar menú" onClick={() => setOpen(false)}><Icon name="cerrar" /></button>
        </div>
        <nav className="sb-nav">
          {nav.map(([to, t, i]) => <NavLink key={to} to={to}><Icon name={i} />{t}</NavLink>)}
        </nav>
        <div className="sb-user">
          <span className="avatar" aria-hidden="true">{iniciales}</span>
          <div><b>{profesional.nombre}</b><small>{profesional.especialidad || (profesional.rol === "admin" ? "Administración" : "Profesional")}</small></div>
          <button className="icon-btn" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión"><Icon name="salir" /></button>
        </div>
      </aside>
      <main id="main" tabIndex="-1">
        {USING_MOCK && <p className="demo-band"><Icon name="alerta" size={16} />Versión de diseño con datos de prueba. Ningún dato es real.</p>}
        <Outlet />
      </main>
    </div>
  );
}
