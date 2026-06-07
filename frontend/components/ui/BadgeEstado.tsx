/**
 * Badge visual para el estado de una interconsulta en el flujo.
 * Estados: pendiente, revisada, derivada, agendada.
 */

import type { EstadoInterconsulta } from "@/types";

interface BadgeEstadoProps {
  estado: EstadoInterconsulta;
}

/** Mapeo de estilos por estado */
const estilosEstado: Record<EstadoInterconsulta, string> = {
  pendiente:
    "bg-[var(--estado-pendiente-bg)] text-[var(--estado-pendiente)]",
  revisada:
    "bg-[var(--estado-revisada-bg)] text-[var(--estado-revisada)]",
  derivada:
    "bg-[var(--estado-derivada-bg)] text-[var(--estado-derivada)]",
  agendada:
    "bg-[var(--estado-agendada-bg)] text-[var(--estado-agendada)]",
};

/** Etiquetas legibles para cada estado */
const etiquetasEstado: Record<EstadoInterconsulta, string> = {
  pendiente: "Pendiente",
  revisada: "Revisada",
  derivada: "Derivada",
  agendada: "Agendada",
};

export default function BadgeEstado({ estado }: BadgeEstadoProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${estilosEstado[estado]}`}
    >
      {etiquetasEstado[estado]}
    </span>
  );
}
