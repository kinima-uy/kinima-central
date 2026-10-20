import { Link } from "react-router-dom";
import { EJERCICIOS } from "../data/ejercicios.js";
import { Iso, COLORS } from "../lib/brand.jsx";
import { PageHead, Icon } from "../components/ui.jsx";

/* Demostraciones animadas (se reemplazan por videos reales cuando estén grabados: ver VIDEOS). */
const VIDEOS = {}; // por ejemplo { objetivos: "/videos/alcanzar-objetivos.mp4" }

function Demo({ id }) {
  if (VIDEOS[id]) return <video src={VIDEOS[id]} controls muted playsInline className="demo-video" />;
  if (id === "objetivos") return (
    <svg viewBox="0 0 320 180" className="demo" role="img" aria-label="Demostración: un punto sigue la punta del dedo y toca los objetivos que aparecen en la tele">
      <rect x="6" y="6" width="308" height="168" rx="16" fill="#E2F3F1" />
      <circle className="t t1" cx="70" cy="60" r="16" fill={COLORS.yellow} />
      <circle className="t t2" cx="240" cy="50" r="16" fill={COLORS.coral} />
      <circle className="t t3" cx="200" cy="130" r="16" fill={COLORS.teal} />
      <circle className="finger" r="9" fill={COLORS.navy} stroke="#fff" strokeWidth="3" />
    </svg>
  );
  return (
    <div className={`demo demo-iso demo-${id}`} role="img" aria-label="Animación ilustrativa del ejercicio">
      <span className="ground" />
      <Iso color={id === "estrellas" ? COLORS.yellow : COLORS.coral} width={70} />
      {id === "estrellas" && <span className="star" aria-hidden="true">★</span>}
    </div>
  );
}

export default function Ejercicios() {
  return (
    <div className="page">
      <PageHead eyebrow="Biblioteca" title="Ejercicios" />
      <p className="muted intro">Los juegos que la consola puede ejecutar. Cada uno se configura al armar la rutina de un paciente.</p>
      <ul className="library">
        {EJERCICIOS.map((e) => (
          <li key={e.id} className={`card lib ${e.disponible ? "" : "soon"}`}>
            <Demo id={e.id} />
            <div className="lib-body">
              <div className="row-between"><h2>{e.nombre}</h2>{e.disponible ? <span className="pill pill-ok"><Icon name="ok" size={14} stroke={2.6} />Disponible</span> : <span className="pill pill-neutral">Próximamente</span>}</div>
              <p>{e.descripcion}</p>
              <div className="tags">{e.trabaja?.map((t) => <span key={t}>{t}</span>)}</div>
              {e.indicaciones && <p className="lib-ind"><b>Cómo prepararlo:</b> {e.indicaciones}</p>}
              {e.campos.length > 0 && <p className="muted small">Se puede ajustar: {e.campos.map((c) => c.label.toLowerCase()).join(", ")}.</p>}
              {e.disponible && <Link className="btn btn-line btn-sm" to="/asignar">Usar en una rutina</Link>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
