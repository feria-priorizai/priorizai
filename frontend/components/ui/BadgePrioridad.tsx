/**
 * Badge visual para mostrar el nivel de prioridad de una interconsulta.
 * Usa colores consistentes con el sistema de diseño clínico:
 * - Alta: rojo (urgencia)
 * - Media: amarillo/naranja (atención moderada)
 * - Baja: verde (electivo)
 */

import type { NivelPrioridad } from "@/types";

interface BadgePrioridadProps {
  prioridad: NivelPrioridad;
  /** Tamaño del badge: 'sm' para tablas, 'lg' para detalle */
  tamano?: "sm" | "lg";
}

/** Mapeo de estilos por nivel de prioridad */
const estilosPrioridad: Record<NivelPrioridad, string> = {
  alta: "bg-[var(--prioridad-alta-bg)] text-[var(--prioridad-alta)] border-[var(--prioridad-alta-border)]",
  media:
    "bg-[var(--prioridad-media-bg)] text-[var(--prioridad-media)] border-[var(--prioridad-media-border)]",
  baja: "bg-[var(--prioridad-baja-bg)] text-[var(--prioridad-baja)] border-[var(--prioridad-baja-border)]",
};

/** Etiquetas legibles para cada nivel */
const etiquetasPrioridad: Record<NivelPrioridad, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export default function BadgePrioridad({
  prioridad,
  tamano = "sm",
}: BadgePrioridadProps) {
  const estiloTamano =
    tamano === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${estilosPrioridad[prioridad]} ${estiloTamano}`}
    >
      {etiquetasPrioridad[prioridad]}
    </span>
  );
}
