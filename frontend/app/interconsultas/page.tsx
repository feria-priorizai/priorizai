"use client";

import { useInterconsultas } from "@/hooks/useInterconsultas";
import FiltrosInterconsultas from "@/components/interconsultas/FiltrosInterconsultas";
import TablaInterconsultasRecientes from "@/components/dashboard/TablaInterconsultasRecientes";

export default function InterconsultasPage() {
  const {
    interconsultas,
    cargando,
    error,
    totalInterconsultas,
    filtros,
    actualizarFiltros,
  } = useInterconsultas();

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
      <FiltrosInterconsultas
        filtros={filtros}
        onCambiarFiltros={actualizarFiltros}
      />

      <TablaInterconsultasRecientes interconsultas={interconsultas} />

      <p className="text-sm text-[var(--text-muted)]">
        Mostrando {interconsultas.length} de {totalInterconsultas} interconsulta
        {totalInterconsultas !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
