import type { EstadoInterconsulta } from "@/types";

interface BadgeEstadoProps {
  estado: EstadoInterconsulta;
}

const etiquetasEstado: Record<EstadoInterconsulta, string> = {
  pendiente: "Pendiente",
  revisada: "Revisada",
};

export default function BadgeEstado({ estado }: BadgeEstadoProps) {
  return (
    <span
      className={`pz-chip ${estado === "revisada" ? "pz-chip--baja" : "pz-chip--neutral"}`}
    >
      {etiquetasEstado[estado]}
    </span>
  );
}
