/**
 * Indicador visual del porcentaje de confianza del modelo de IA.
 * Muestra una barra de progreso con color según el nivel de certeza.
 * Requerido por HdU01: "mostrar claramente el porcentaje de certeza".
 */

interface IndicadorConfianzaProps {
  /** Porcentaje de confianza (0-100) */
  porcentaje: number;
}

/** Determina el color de la barra según el porcentaje */
function obtenerColorConfianza(porcentaje: number): string {
  if (porcentaje >= 80) return "var(--confianza-alta)";
  if (porcentaje >= 60) return "var(--confianza-media)";
  return "var(--confianza-baja)";
}

/** Texto descriptivo del nivel de confianza */
function obtenerTextoConfianza(porcentaje: number): string {
  if (porcentaje >= 80) return "Confianza alta";
  if (porcentaje >= 60) return "Confianza moderada";
  return "Confianza baja";
}

export default function IndicadorConfianza({
  porcentaje,
}: IndicadorConfianzaProps) {
  const color = obtenerColorConfianza(porcentaje);
  const texto = obtenerTextoConfianza(porcentaje);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-secondary)]">{texto}</span>
        <span className="text-sm font-bold" style={{ color }}>
          {porcentaje}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--border-light)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${porcentaje}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}
