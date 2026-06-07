"use client";

/**
 * Panel de resumen estadístico del dashboard.
 * Muestra indicadores clave: total interconsultas, pendientes,
 * distribución por prioridad.
 * Relacionado con HdU05: gestionar carga de trabajo en un solo lugar.
 */

import type { Interconsulta } from "@/types";
import TarjetaEstadistica from "@/components/ui/TarjetaEstadistica";

interface ResumenEstadisticasProps {
  interconsultas: Interconsulta[];
}

export default function ResumenEstadisticas({
  interconsultas,
}: ResumenEstadisticasProps) {
  const total = interconsultas.length;
  const pendientes = interconsultas.filter((ic) => ic.estado === "pendiente").length;
  const prioridadAlta = interconsultas.filter(
    (ic) => ic.prioridadActual === "alta"
  ).length;
  const agendadas = interconsultas.filter((ic) => ic.estado === "agendada").length;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <TarjetaEstadistica
        titulo="Total interconsultas"
        valor={total}
        icono="📋"
      />
      <TarjetaEstadistica
        titulo="Pendientes"
        valor={pendientes}
        icono="⏳"
        colorAccento="var(--estado-pendiente)"
      />
      <TarjetaEstadistica
        titulo="Prioridad alta"
        valor={prioridadAlta}
        icono="🔴"
        colorAccento="var(--prioridad-alta)"
      />
      <TarjetaEstadistica
        titulo="Agendadas"
        valor={agendadas}
        icono="✅"
        colorAccento="var(--estado-agendada)"
      />
    </div>
  );
}
