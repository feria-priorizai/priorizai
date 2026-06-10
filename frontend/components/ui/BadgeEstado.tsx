import type { EstadoInterconsulta } from "@/types";

interface BadgeEstadoProps {
  estado: EstadoInterconsulta;
}

const estilosEstado: Record<EstadoInterconsulta, string> = {
  pendiente:
    "bg-[var(--estado-pendiente-bg)] text-[var(--estado-pendiente)]",
  revisada:
    "bg-[var(--estado-revisada-bg)] text-[var(--estado-revisada)]",
};

const etiquetasEstado: Record<EstadoInterconsulta, string> = {
  pendiente: "Pendiente",
  revisada: "Revisada",
};

export default function BadgeEstado({ estado }: BadgeEstadoProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${estilosEstado[estado]}`}
    >
      {etiquetasEstado[estado]}
    </span>
  );
}
