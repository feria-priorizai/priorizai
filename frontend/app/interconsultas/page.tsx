"use client";

import { useInterconsultas } from "@/hooks/useInterconsultas";
import FiltrosInterconsultas from "@/components/interconsultas/FiltrosInterconsultas";
import TablaInterconsultasRecientes from "@/components/dashboard/TablaInterconsultasRecientes";
import EstadoVista from "@/components/ui/EstadoVista";

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
    return <EstadoVista tipo="cargando" texto="Cargando interconsultas…" />;
  }

  if (error) {
    return <EstadoVista tipo="error" texto={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <FiltrosInterconsultas
        filtros={filtros}
        onCambiarFiltros={actualizarFiltros}
      />

      <TablaInterconsultasRecientes
        interconsultas={interconsultas}
        titulo="Lista de espera"
      />

      <p className="pz-label">
        Mostrando {interconsultas.length} de {totalInterconsultas} interconsulta
        {totalInterconsultas !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
