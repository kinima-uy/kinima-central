import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import * as api from "./api.js";

const AuthCtx = createContext(null);
const KEY = "kinima-portal-sesion";

/* La sesión vive solo en esta pestaña (sessionStorage) y vence a las 8 horas en el servidor. */
function leer() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } }
function escribir(v) { try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(leer);
  const iniciar = (s) => { setSesion(s); escribir(s); return s; };
  const entrar = async (email, password) => iniciar(await api.login(email, password));
  const salir = () => { api.salir(); setSesion(null); escribir(null); };
  /* Si el servidor responde que la sesión venció, se vuelve a la pantalla de ingreso. */
  useEffect(() => {
    const vencida = () => { setSesion(null); escribir(null); };
    addEventListener("kinima:sesion-vencida", vencida);
    return () => removeEventListener("kinima:sesion-vencida", vencida);
  }, []);
  return <AuthCtx.Provider value={{ profesional: sesion?.profesional || null, entrar, iniciar, salir }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function RequireAuth({ children, admin = false }) {
  const { profesional } = useAuth();
  const loc = useLocation();
  if (!profesional) return <Navigate to="/ingresar" replace state={{ from: loc.pathname }} />;
  if (admin && profesional.rol !== "admin") return <Navigate to="/pacientes" replace />;
  return children;
}
