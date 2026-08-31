"use client";

/**
 * Panel principal (HdU05): riel de cifras y lista de espera ordenada por el
 * backend según prioridad y fecha de emisión.
 */

import { useInterconsultas } from "@/hooks/useInterconsultas";
import ResumenEstadisticas from "@/components/dashboard/ResumenEstadisticas";
import TablaInterconsultasRecientes from "@/components/dashboard/TablaInterconsultasRecientes";
import EstadoVista from "@/components/ui/EstadoVista";

export default function DashboardPage() {
  const { interconsultas, cargando, error } = useInterconsultas();

  if (cargando) {
    return <EstadoVista tipo="cargando" texto="Cargando interconsultas…" />;
  }

  if (error) {
    return <EstadoVista tipo="error" texto={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <ResumenEstadisticas interconsultas={interconsultas} />
      <TablaInterconsultasRecientes
        interconsultas={interconsultas}
        titulo="Interconsultas recientes"
      />
    </div>
  );
}
