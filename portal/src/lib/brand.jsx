
/** Ruta a un archivo de /public, respetando la base del sitio. */
export const asset = (p) => import.meta.env.BASE_URL + p;

/* Forma oficial de la K de Kinima (del archivo del logo). */
export const K_PATH =
  "M247.42,477.92c-2.21-25.45-17.48-59.42-38.17-57.87-29.6,2.21-26.55,33.19-26.55,33.19v173.51s-3.04,30.98,26.55,33.19c20.69,1.55,35.96-32.42,38.17-57.87,0,0,62.37,81.61,89.62,45.42,31.66-42.04-39.28-92.57-74.43-107.5,35.15-14.93,106.09-65.46,74.43-107.5-27.25-36.19-89.62,45.42-89.62,45.42Z";

/* La personita: la K girada 90° con el punto como cabeza. */
const ROT = "rotate(90 213.5 540)";
export const HIP = "213.5 554.5";
export const GROUND = "213.5 672";

export const COLORS = { teal: "#55BDB5", yellow: "#F2C96D", coral: "#EF8B76", navy: "#19324A", cream: "#F7F5EF" };

/** Logo oficial completo. variant: "navy" (fondos claros) o "crema" (fondos oscuros). */
export function Logo({ variant = "navy", className, height = 36 }) {
  return (
    <img
      src={asset(`logo-${variant}.svg`)}
      alt="Kinima"
      className={className}
      width={Math.round(height * 3.48)}
      height={height}
      style={{ height, width: "auto" }}
    />
  );
}

/** Isotipo en color sólido (versión secundaria del manual). */
export function Iso({ color = COLORS.teal, className, width = 40, ...rest }) {
  return (
    <svg viewBox="80 395 268 290" width={width} className={`iso ${className || ""}`} aria-hidden="true" {...rest}>
      <g transform={ROT} fill={color}>
        <circle cx="122.61" cy="540" r="40" />
        <path d={K_PATH} />
      </g>
    </svg>
  );
}

