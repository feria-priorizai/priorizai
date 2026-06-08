"use client";

/**
 * Página principal del Dashboard (HdU05).
 * Muestra un resumen de las interconsultas y una tabla con las más recientes.
 * Permite al médico visualizar su carga de trabajo en un solo lugar.
 */

import { useInterconsultas } from "@/hooks/useInterconsultas";
import ResumenEstadisticas from "@/components/dashboard/ResumenEstadisticas";
import TablaInterconsultasRecientes from "@/components/dashboard/TablaInterconsultasRecientes";

export default function DashboardPage() {
  const { interconsultas, cargando, error } = useInterconsultas();

  if (cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-[var(--text-secondary)]">Cargando interconsultas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-[var(--prioridad-alta)]">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tarjetas de resumen estadístico */}
      <ResumenEstadisticas interconsultas={interconsultas} />

      {/* Tabla de interconsultas recientes */}
      <TablaInterconsultasRecientes interconsultas={interconsultas} />
    </div>
  );
}
