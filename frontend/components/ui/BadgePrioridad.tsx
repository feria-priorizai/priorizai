/**
 * Chip de prioridad clínica, en la gramática mono de la marca.
 * Alta: rojo — Media: ámbar — Baja: verde.
 */

import type { NivelPrioridad } from "@/types";

interface BadgePrioridadProps {
  prioridad: NivelPrioridad;
  /** 'sm' para tablas, 'lg' para el detalle */
  tamano?: "sm" | "lg";
}

const etiquetasPrioridad: Record<NivelPrioridad, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export default function BadgePrioridad({
  prioridad,
  tamano = "sm",
}: BadgePrioridadProps) {
  return (
    <span
      className={`pz-chip pz-chip--${prioridad} ${tamano === "lg" ? "pz-chip--lg" : ""}`}
    >
      {etiquetasPrioridad[prioridad]}
    </span>
  );
}
