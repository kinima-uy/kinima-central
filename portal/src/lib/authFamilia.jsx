import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import * as apiFamilia from "./apiFamilia.js";

const AuthFamiliaCtx = createContext(null);
const KEY = "kinima-familia-sesion";

function leer() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } }
function escribir(v) { try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }

export function AuthFamiliaProvider({ children }) {
  const [familia, setFamilia] = useState(leer);
  const entrar = async (email, password) => {
    const f = await apiFamilia.entrar(email, password);
    setFamilia(f); escribir(f);
    return f;
  };
  const salir = () => { apiFamilia.salir(); setFamilia(null); escribir(null); };
  useEffect(() => {
    const vencida = () => { setFamilia(null); escribir(null); };
    addEventListener("kinima:familia-sesion-vencida", vencida);
    return () => removeEventListener("kinima:familia-sesion-vencida", vencida);
  }, []);
  return <AuthFamiliaCtx.Provider value={{ familia, entrar, salir }}>{children}</AuthFamiliaCtx.Provider>;
}

export const useAuthFamilia = () => useContext(AuthFamiliaCtx);

export function RequireFamilia({ children }) {
  const { familia } = useAuthFamilia();
  const loc = useLocation();
  if (!familia) return <Navigate to="/familia/ingresar" replace state={{ from: loc.pathname }} />;
  return children;
}
