"use client";

/**
 * Página de listado de interconsultas con filtros.
 * Combina filtrado (Funcionalidad 5) con visualización tabular (HdU05/HdU06).
 * Las filas son clickeables para navegar al detalle.
 */

import { useState } from "react";
import { useInterconsultas } from "@/hooks/useInterconsultas";
import FiltrosInterconsultas from "@/components/interconsultas/FiltrosInterconsultas";
import TablaInterconsultasRecientes from "@/components/dashboard/TablaInterconsultasRecientes";
import { priorizarInterconsultasPendientes } from "@/services/interconsultas";

export default function InterconsultasPage() {
  const { interconsultas, cargando, error, filtros, actualizarFiltros, recargar } =
    useInterconsultas();
  const [priorizando, setPriorizando] = useState(false);
  const [mensajePriorizacion, setMensajePriorizacion] = useState<string | null>(
    null,
  );

  const manejarPriorizarPendientes = async () => {
    setPriorizando(true);
    setMensajePriorizacion(null);
    try {
      const resultado = await priorizarInterconsultasPendientes(25);
      setMensajePriorizacion(
        resultado.total > 0
          ? `${resultado.total} interconsultas priorizadas.`
          : "No hay interconsultas pendientes por priorizar.",
      );
      await recargar();
    } catch {
      setMensajePriorizacion("No se pudo priorizar el lote pendiente.");
    } finally {
      setPriorizando(false);
    }
  };

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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)]">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Priorizacion por lote
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Ejecuta el modelo sobre las siguientes 25 interconsultas pendientes.
          </p>
        </div>
        <button
          type="button"
          onClick={manejarPriorizarPendientes}
          disabled={priorizando}
          className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {priorizando ? "Priorizando..." : "Priorizar pendientes"}
        </button>
        {mensajePriorizacion && (
          <p className="basis-full text-sm text-[var(--text-secondary)]">
            {mensajePriorizacion}
          </p>
        )}
      </div>

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
