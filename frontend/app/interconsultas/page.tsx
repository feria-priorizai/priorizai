"use client";

/**
 * Página de listado de interconsultas con filtros.
 * Combina filtrado (Funcionalidad 5) con visualización tabular (HdU05/HdU06).
 * Las filas son clickeables para navegar al detalle.
 */

import { useInterconsultas } from "@/hooks/useInterconsultas";
import FiltrosInterconsultas from "@/components/interconsultas/FiltrosInterconsultas";
import TablaInterconsultasRecientes from "@/components/dashboard/TablaInterconsultasRecientes";

export default function InterconsultasPage() {
  const { interconsultas, cargando, error, filtros, actualizarFiltros } =
    useInterconsultas();

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
      {/* Filtros de búsqueda, prioridad y estado */}
      <FiltrosInterconsultas
        filtros={filtros}
        onCambiarFiltros={actualizarFiltros}
      />

      {/* Tabla reutilizada del dashboard con los resultados filtrados */}
      <TablaInterconsultasRecientes interconsultas={interconsultas} />

      {/* Contador de resultados */}
      <p className="text-sm text-[var(--text-muted)]">
        Mostrando {interconsultas.length} interconsulta
        {interconsultas.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
