import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./lib/auth.jsx";
import { AuthFamiliaProvider, RequireFamilia } from "./lib/authFamilia.jsx";
import Layout from "./components/Layout.jsx";
import LayoutFamilia from "./components/LayoutFamilia.jsx";
import Login from "./pages/Login.jsx";
import FamiliaLogin from "./pages/FamiliaLogin.jsx";
import FamiliaInicio from "./pages/FamiliaInicio.jsx";
import Pacientes from "./pages/Pacientes.jsx";
import Paciente from "./pages/Paciente.jsx";
import Asignar from "./pages/Asignar.jsx";
import Consolas from "./pages/Consolas.jsx";
import Profesionales from "./pages/Profesionales.jsx";
import Ejercicios from "./pages/Ejercicios.jsx";
import Informe from "./pages/Informe.jsx";
import { Empty } from "./components/ui.jsx";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/500.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./styles.css";

/* En la web publicada (portal.kinima.uy) se usa BrowserRouter. La vista previa usa MemoryRouter. */
const Router = import.meta.env.VITE_PREVIEW ? MemoryRouter : BrowserRouter;

/* App instalable (PWA) solo para la familia (/familia): no cambia nada para el portal profesional.
   Va acá (no en un <script> suelto de index.html) porque el CSP del servidor solo permite scripts propios del bundle. */
if (location.pathname.startsWith("/familia")) {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/manifest-familia.webmanifest";
  document.head.appendChild(link);
  document.title = "Kinima · Familias";
  document.head.insertAdjacentHTML(
    "beforeend",
    '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Kinima">'
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <AuthFamiliaProvider>
        <Router>
          <Routes>
            <Route path="/ingresar" element={<Login />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route path="/" element={<Navigate to="/pacientes" replace />} />
              <Route path="/pacientes" element={<Pacientes />} />
              <Route path="/pacientes/:id" element={<Paciente />} />
              <Route path="/pacientes/:id/informe" element={<Informe />} />
              <Route path="/asignar" element={<Asignar />} />
              <Route path="/ejercicios" element={<Ejercicios />} />
              <Route path="/consolas" element={<Consolas />} />
              <Route path="/profesionales" element={<RequireAuth admin><Profesionales /></RequireAuth>} />
            </Route>
            <Route path="/familia/ingresar" element={<FamiliaLogin />} />
            <Route element={<RequireFamilia><LayoutFamilia /></RequireFamilia>}>
              <Route path="/familia" element={<FamiliaInicio />} />
            </Route>
            <Route path="*" element={<div className="page"><Empty icon="alerta" title="Esta página no existe"><Link to="/pacientes">Volver a pacientes</Link></Empty></div>} />
          </Routes>
        </Router>
      </AuthFamiliaProvider>
    </AuthProvider>
  </StrictMode>
);
