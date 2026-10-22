/*
 * Conexión con la API central de Kinima para la app de familias (ver docs/contrato-api.md, sección
 * "Operación de la familia"). Mismo dominio que el portal, pero con su propio token: una familia
 * nunca puede usar su sesión para entrar a rutas de profesional/admin, ni al revés.
 */
const API = "/api/v1/family";
const KEY = "kinima-familia-token";
let token = (() => { try { return sessionStorage.getItem(KEY); } catch { return null; } })();
const guardarToken = (t) => { token = t; try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } };

async function req(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/auth/login") {
    guardarToken(null);
    window.dispatchEvent(new Event("kinima:familia-sesion-vencida"));
  }
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || "Algo salió mal en el servidor."), { status: res.status, code: data?.error?.code });
  return data;
}

export async function entrar(email, password) {
  const r = await req("/auth/login", { method: "POST", body: { email: email.trim(), password } });
  guardarToken(r.accessToken);
  return r.family;
}
export const salir = () => guardarToken(null);
export const hayToken = () => !!token;

export async function getPacientes() {
  const { patients } = await req("/patients");
  return patients.map((p) => ({ id: p.id, codigo: p.localCode, etiqueta: p.displayLabel }));
}
export async function getAsignacion(patientId) {
  const { assignment } = await req(`/patients/${patientId}/assignment`);
  return assignment;
}
export async function getSesiones(patientId, limit = 50) {
  const { sessions } = await req(`/patients/${patientId}/sessions?limit=${limit}`);
  return sessions;
}
