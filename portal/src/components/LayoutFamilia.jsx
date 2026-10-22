import { Outlet } from "react-router-dom";
import { Logo } from "../lib/brand.jsx";
import { useAuthFamilia } from "../lib/authFamilia.jsx";
import { Icon } from "./ui.jsx";

export default function LayoutFamilia() {
  const { familia, salir } = useAuthFamilia();
  return (
    <div className="app app-familia">
      <a className="skip" href="#main">Saltar al contenido</a>
      <header className="topbar">
        <Logo height={26} />
        <span className="sb-tag">App para familias</span>
        <button className="icon-btn" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión"><Icon name="salir" /></button>
      </header>
      <main id="main" tabIndex="-1" className="familia-main">
        <p className="familia-saludo">Hola, <b>{familia.displayName}</b></p>
        <Outlet />
      </main>
    </div>
  );
}
