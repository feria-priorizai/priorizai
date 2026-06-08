"use client";

/**
 * Panel de filtros para la lista de interconsultas.
 * Permite filtrar por prioridad, estado y búsqueda de texto libre.
 * Relacionado con HdU05 (funcionalidad 5): herramientas de filtrado.
 */

import type { FiltrosInterconsulta } from "@/hooks/useInterconsultas";

interface FiltrosInterconsultasProps {
  filtros: FiltrosInterconsulta;
  onCambiarFiltros: (nuevosFiltros: Partial<FiltrosInterconsulta>) => void;
}

export default function FiltrosInterconsultas({
  filtros,
  onCambiarFiltros,
}: FiltrosInterconsultasProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      {/* Búsqueda por texto libre */}
      <div className="flex-1 min-w-[200px]">
        <input
          type="text"
          placeholder="Buscar por nombre, RUT o diagnóstico..."
          value={filtros.busqueda}
          onChange={(e) => onCambiarFiltros({ busqueda: e.target.value })}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>

      {/* Filtro por prioridad */}
      <select
        value={filtros.prioridad}
        onChange={(e) =>
          onCambiarFiltros({
            prioridad: e.target.value as FiltrosInterconsulta["prioridad"],
          })
        }
        className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
      >
        <option value="todas">Todas las prioridades</option>
        <option value="alta">Prioridad alta</option>
        <option value="media">Prioridad media</option>
        <option value="baja">Prioridad baja</option>
      </select>

      {/* Filtro por estado */}
      <select
        value={filtros.estado}
        onChange={(e) =>
          onCambiarFiltros({
            estado: e.target.value as FiltrosInterconsulta["estado"],
          })
        }
        className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
      >
        <option value="todos">Todos los estados</option>
        <option value="pendiente">Pendiente</option>
        <option value="revisada">Revisada</option>
        <option value="derivada">Derivada</option>
        <option value="agendada">Agendada</option>
      </select>
    </div>
  );
}
