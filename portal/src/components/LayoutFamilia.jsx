import { Outlet } from "react-router-dom";
import { Logo } from "../lib/brand.jsx";
import { useAuthFamilia } from "../lib/authFamilia.jsx";
import { Icon } from "./ui.jsx";

export default function LayoutFamilia() {
  const { salir } = useAuthFamilia();
  return (
    <div className="app app-familia">
      <a className="skip" href="#main">Saltar al contenido</a>
      <header className="topbar">
        <Logo height={24} />
        <span className="sb-tag">App para familias</span>
        <button className="icon-btn" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión"><Icon name="salir" /></button>
      </header>
      <main id="main" tabIndex="-1" className="familia-main">
        <Outlet />
      </main>
    </div>
  );
}
