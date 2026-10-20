import { useCallback, useEffect, useState } from "react";

/* Carga datos de la API y expone { data, error, loading, reload }. */
export function useData(fn, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    let alive = true;
    set((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => alive && set({ data, error: null, loading: false }))
      .catch((error) => alive && set({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, deps);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
export function haceCuanto(iso) {
  if (!iso) return "Nunca";
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, "hour");
  return rtf.format(Math.round(h / 24), "day");
}
export const fecha = (iso, o = { day: "numeric", month: "short" }) => new Date(iso).toLocaleDateString("es-UY", o);
export const hora = (iso) => new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
export const minutos = (seg) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
