/**
 * Chip de prioridad clínica, en la gramática mono de la marca.
 * Alta: rojo — Media: ámbar — Baja: verde.
 */

import type { NivelPrioridad } from "@/types";

interface BadgePrioridadProps {
  prioridad: NivelPrioridad;
}

const etiquetasPrioridad: Record<NivelPrioridad, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export default function BadgePrioridad({ prioridad }: BadgePrioridadProps) {
  return (
    <span className={`pz-chip pz-chip--${prioridad}`}>
      {etiquetasPrioridad[prioridad]}
    </span>
  );
}
