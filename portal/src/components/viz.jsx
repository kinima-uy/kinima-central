/*
 * Visualizaciones del portal, tomadas del moodboard:
 * curva de progreso suave con relleno, mapa de alcance (puntos sobre la pantalla),
 * tira de la semana, mini-curvas por paciente y cintas de movimiento decorativas.
 * Colores de datos validados para daltonismo: logrado #0F9A90 · no logrado #E25B42, y siempre con forma distinta.
 */
import { useEffect, useRef, useState } from "react";
import { fecha, hora } from "../lib/util.js";
import { Iso, COLORS } from "../lib/brand.jsx";
import { Empty } from "./ui.jsx";
import { ANIMOS, duracionTexto } from "../data/ejercicios.js";
import { ritmo } from "../lib/modelo.js";

export const HIT = "#0F9A90", MISS = "#E25B42";

function useWidth(min = 260, def = 640) {
  const ref = useRef(null);
  const [w, setW] = useState(def);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, Math.round(e.contentRect.width))));
    ro.observe(ref.current); return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}

/* Curva suave (Catmull-Rom → Bézier) */
function smooth(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/* Tope "redondo" para el eje: 10, 20, 25, 40, 50, 80, 100… */
function tope(max) {
  const m = Math.max(5, max), p = 10 ** Math.floor(Math.log10(m));
  return [1, 2, 2.5, 4, 5, 8, 10].map((k) => k * p).find((v) => v >= m);
}

/* Curva de progreso: aciertos por sesión con área degradada y tooltip. */
export function CurvaProgreso({ sesiones, marcas = [], max, fijo }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  if (!sesiones.length) return <Empty icon="objetivo" title="Todavía no hay sesiones">Cuando la consola sincronice, vas a ver la curva de progreso acá.</Empty>;
  const data = fijo ? sesiones : sesiones.slice(-(max || (w < 480 ? 8 : 14)));
  const H = w < 480 ? 190 : 240, L = 30, R = 12, T = 16, B = 28;
  const x = (i) => L + (data.length === 1 ? (w - L - R) / 2 : (i * (w - L - R)) / (data.length - 1));
  const top = tope(Math.max(...data.map((s) => s.aciertos)));
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const pts = data.map((s, i) => [x(i), y(s.aciertos)]);
  const line = smooth(pts);
  const area = `${line} L${pts.at(-1)[0]},${y(0)} L${pts[0][0]},${y(0)} Z`;
  const h = hover != null ? data[hover] : null;
  const step = (w - L - R) / Math.max(1, data.length - 1);
  /* Cambios de rutina: línea punteada entre la última sesión anterior y la primera posterior al cambio. */
  const lineas = marcas.map((m) => {
    const k = data.findIndex((s) => s.fecha > m.creada);
    if (k === 0) return null;
    const xm = k === -1 ? w - R - 2 : (x(k - 1) + x(k)) / 2;
    return { ...m, xm };
  }).filter(Boolean);

  return (
    <figure className="chart" ref={ref}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Aciertos de las últimas ${data.length} sesiones`}>
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#55BDB5" stopOpacity=".38" />
            <stop offset="1" stopColor="#55BDB5" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v ? "3 5" : ""} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="axis">{v}</text>
          </g>
        ))}
        {lineas.map((m) => (
          <g key={m.version} className="mark">
            <title>{`Versión ${m.version} · ${fecha(m.creada)}: ${m.motivo || "Cambio de rutina"}`}</title>
            <line x1={m.xm} x2={m.xm} y1={T + 14} y2={y(0)} stroke="var(--navy)" strokeWidth="1.5" strokeDasharray="4 4" strokeOpacity=".55" />
            <rect x={Math.min(m.xm, w - R - 14) - 14} y={T - 6} width="28" height="18" rx="9" fill="var(--navy)" />
            <text x={Math.min(m.xm, w - R - 14)} y={T + 7} textAnchor="middle" className="mark-t">v{m.version}</text>
          </g>
        ))}
        <path d={area} fill="url(#area)" />
        <path d={line} fill="none" stroke={HIT} strokeWidth="2.5" strokeLinecap="round" />
        {hover != null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1={T} y2={y(0)} stroke="var(--navy)" strokeOpacity=".25" />}
        {data.map((s, i) => (
          <g key={s.id}>
            <circle cx={pts[i][0]} cy={pts[i][1]} r={hover === i ? 7 : 5}
              fill={s.sincronizada ? HIT : "var(--white)"} stroke={s.sincronizada ? "var(--white)" : "#B07D12"} strokeWidth="2.5" strokeDasharray={s.sincronizada ? "" : "3 2"} />
            <rect x={pts[i][0] - step / 2} y={T} width={step} height={H - T - B} fill="transparent" tabIndex="0"
              aria-label={`${fecha(s.fecha)}: ${s.aciertos} aciertos${s.sincronizada ? "" : ", sin sincronizar"}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
          </g>
        ))}
        {[0, data.length - 1].map((i) => <text key={i} x={pts[i][0]} y={H - 8} textAnchor={i ? "end" : "start"} className="axis">{fecha(data[i].fecha)}</text>)}
      </svg>
      {h && (
        <div className="tip" style={{ left: Math.min(Math.max(pts[hover][0], 90), w - 90), top: pts[hover][1] - 12 }}>
          <b>{h.aciertos} aciertos</b>
          <span>{fecha(h.fecha, { weekday: "short", day: "numeric", month: "short" })} · {hora(h.fecha)}</span>
          <span>{ritmo(h)} por minuto · {duracionTexto(h.duracionSeg)}{h.completa ? "" : " · no la terminó"}</span>
          {!h.sincronizada && <span>Guardada en la consola, sin sincronizar</span>}
          {h.animo && <span>{ANIMOS[h.animo].emoji} {ANIMOS[h.animo].t}{h.comentarioFamilia ? ` · “${h.comentarioFamilia}”` : ""}</span>}
        </div>
      )}
      <figcaption className="legend">
        <span><i className="dot" style={{ background: HIT }} />Sesión sincronizada</span>
        {data.some((s) => !s.sincronizada) && <span><i className="dot dot-pend" />Pendiente de sincronizar</span>}
        {lineas.length > 0 && <span><i className="mark-sw" />Cambio de rutina (v = versión)</span>}
      </figcaption>
    </figure>
  );
}

/* Mapa de alcance: dónde aparecieron los objetivos en la tele y si el niño llegó a tocarlos. */
export function MapaAlcance({ puntos, mano }) {
  const [ref, w] = useWidth(240, 420);
  const [hover, setHover] = useState(null);
  if (!puntos?.length) return <Empty icon="objetivo" title="Sin datos de alcance todavía" />;
  const H = Math.round(w * 0.56);
  const zonas = [["Arriba izq.", 0, 0], ["Arriba der.", 0.5, 0], ["Abajo izq.", 0, 0.5], ["Abajo der.", 0.5, 0.5]].map(([n, zx, zy]) => {
    const en = puntos.filter((p) => p.x >= zx && p.x < zx + 0.5 && p.y >= zy && p.y < zy + 0.5);
    return { n, zx, zy, pct: en.length ? Math.round((en.filter((p) => p.hit).length / en.length) * 100) : null };
  });
  const peor = zonas.filter((z) => z.pct != null).sort((a, b) => a.pct - b.pct)[0];
  const total = puntos.filter((p) => p.hit).length;
  return (
    <figure className="reach" ref={ref}>
      <div className="reach-tv">
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Mapa de alcance: ${total} de ${puntos.length} objetivos logrados. Zona más difícil: ${peor?.n}, ${peor?.pct}%.`}>
          <rect x="1" y="1" width={w - 2} height={H - 2} rx="14" fill="var(--cream)" stroke="var(--line)" strokeWidth="2" />
          <line x1={w / 2} x2={w / 2} y1="10" y2={H - 10} stroke="var(--line)" strokeDasharray="4 6" />
          <line x1="10" x2={w - 10} y1={H / 2} y2={H / 2} stroke="var(--line)" strokeDasharray="4 6" />
          {puntos.map((p, i) => {
            const cx = 14 + p.x * (w - 28), cy = 14 + p.y * (H - 28);
            return p.hit
              ? <circle key={i} cx={cx} cy={cy} r={hover === i ? 8 : 6} fill={HIT} fillOpacity=".85" stroke="var(--white)" strokeWidth="2" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              : <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <circle cx={cx} cy={cy} r={hover === i ? 8 : 6} fill="var(--white)" stroke={MISS} strokeWidth="2.5" />
                  <path d={`M${cx - 2.5},${cy - 2.5}l5,5M${cx + 2.5},${cy - 2.5}l-5,5`} stroke={MISS} strokeWidth="2" strokeLinecap="round" />
                </g>;
          })}
          {zonas.map((z) => z.pct != null && (
            <text key={z.n} x={z.zx * w + (z.zx ? w / 2 - 12 : 12)} y={z.zy * H + (z.zy ? H / 2 - 12 : 24)} textAnchor={z.zx ? "end" : "start"} className={`zone ${z === peor ? "worst" : ""}`}>{z.pct}%</text>
          ))}
        </svg>
      </div>
      <figcaption className="legend">
        <span><i className="dot" style={{ background: HIT }} />Logrado ({total})</span>
        <span><i className="dot dot-miss" />No logrado ({puntos.length - total})</span>
        {mano && <span className="muted">Zona: {mano}</span>}
      </figcaption>
      {peor && peor.pct < 70 && <p className="reach-note">La zona <b>{peor.n.toLowerCase()}</b> es la más difícil ({peor.pct}% logrado). Podés achicar esa zona o agrandar los objetivos.</p>}
    </figure>
  );
}

/* Tira de la semana: un punto por día, lleno si hubo sesión. */
export function Semana({ sesiones }) {
  const dias = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6 + i); return d; });
  return (
    <ol className="weekstrip" aria-label="Sesiones de los últimos 7 días">
      {dias.map((d) => {
        const n = sesiones.filter((s) => new Date(s.fecha).toDateString() === d.toDateString()).length;
        const hoy = d.toDateString() === new Date().toDateString();
        return (
          <li key={d.toISOString()} className={`${n ? "on" : ""} ${hoy ? "today" : ""}`}>
            <small>{d.toLocaleDateString("es-UY", { weekday: "narrow" })}</small>
            <span aria-label={`${d.toLocaleDateString("es-UY", { weekday: "long", day: "numeric" })}: ${n ? `${n} sesión` : "sin sesión"}`}>{d.getDate()}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* Mini curva para la lista de pacientes. */
export function Sparkline({ valores, w = 96, h = 34 }) {
  if (valores.length < 2) return <span className="spark-empty" aria-hidden="true">—</span>;
  const top = Math.max(1, ...valores);
  const pts = valores.map((v, i) => [3 + (i * (w - 6)) / (valores.length - 1), 3 + (h - 6) * (1 - v / top)]);
  const line = smooth(pts);
  return (
    <svg width={w} height={h} className="spark" aria-hidden="true">
      <defs><linearGradient id="spk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#55BDB5" stopOpacity=".3" /><stop offset="1" stopColor="#55BDB5" stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${pts.at(-1)[0]},${h} L${pts[0][0]},${h} Z`} fill="url(#spk)" />
      <path d={line} fill="none" stroke={HIT} strokeWidth="2" strokeLinecap="round" />
      <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="3" fill={HIT} />
    </svg>
  );
}

/* Cintas de movimiento (decorativas), como las del moodboard. */
export function Cintas({ className = "" }) {
  return (
    <svg className={`cintas ${className}`} viewBox="0 0 800 260" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-20,170 C120,90 240,230 400,150 S640,60 820,120" stroke={COLORS.teal} strokeWidth="26" fill="none" strokeLinecap="round" />
      <path d="M-20,210 C150,150 260,250 430,190 S660,130 820,170" stroke={COLORS.yellow} strokeWidth="16" fill="none" strokeLinecap="round" />
      <path d="M-20,120 C140,60 280,170 440,100 S650,30 820,70" stroke={COLORS.coral} strokeWidth="10" fill="none" strokeLinecap="round" />
      {[...Array(14)].map((_, i) => <circle key={i} cx={40 + i * 55} cy={60 + ((i * 37) % 70)} r={i % 3 ? 3 : 5} fill={[COLORS.teal, COLORS.yellow, COLORS.coral][i % 3]} />)}
    </svg>
  );
}

/* Personitas en movimiento (isotipo en distintas poses y colores). */
export function Personitas() {
  return (
    <div className="personitas" aria-hidden="true">
      <Iso color={COLORS.teal} width={132} style={{ transform: "rotate(-14deg)" }} />
      <Iso color={COLORS.yellow} width={108} style={{ transform: "rotate(10deg) translateY(-26px)" }} />
      <Iso color={COLORS.coral} width={120} style={{ transform: "rotate(-4deg) translateY(8px)" }} />
    </div>
  );
}
