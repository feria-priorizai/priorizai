/**
 * Certeza del modelo (HdU01). Barra recta y cifra en mono: el plano mide, no
 * redondea.
 */

interface IndicadorConfianzaProps {
  /** Porcentaje de confianza (0-100) */
  porcentaje: number;
}

function nivelConfianza(porcentaje: number): "alta" | "media" | "baja" {
  if (porcentaje >= 80) return "alta";
  if (porcentaje >= 60) return "media";
  return "baja";
}

const textos: Record<"alta" | "media" | "baja", string> = {
  alta: "Confianza alta",
  media: "Confianza moderada",
  baja: "Confianza baja",
};

export default function IndicadorConfianza({
  porcentaje,
}: IndicadorConfianzaProps) {
  const nivel = nivelConfianza(porcentaje);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="pz-label">{textos[nivel]}</span>
        <span
          className="pz-mono text-[.95rem] font-semibold"
          style={{ color: `var(--confianza-${nivel})` }}
        >
          {porcentaje}%
        </span>
      </div>
      <div
        className="pz-meter"
        role="meter"
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={textos[nivel]}
      >
        <div
          className={`pz-meter__fill pz-meter__fill--${nivel === "alta" ? "baja" : nivel}`}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}
