"use client";

import type { FiltrosInterconsulta } from "@/hooks/useInterconsultas";

interface FiltrosInterconsultasProps {
  filtros: FiltrosInterconsulta;
  onCambiarFiltros: (nuevosFiltros: Partial<FiltrosInterconsulta>) => void;
  deshabilitado?: boolean;
}

export default function FiltrosInterconsultas({
  filtros,
  onCambiarFiltros,
  deshabilitado = false,
}: FiltrosInterconsultasProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="min-w-[200px] flex-1">
        <input
          type="text"
          placeholder="Buscar por nombre, RUT o diagnostico..."
          value={filtros.busqueda}
          onChange={(e) => onCambiarFiltros({ busqueda: e.target.value })}
          disabled={deshabilitado}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <select
        value={filtros.prioridad}
        onChange={(e) =>
          onCambiarFiltros({
            prioridad: e.target.value as FiltrosInterconsulta["prioridad"],
          })
        }
        disabled={deshabilitado}
        className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="todas">Todas las prioridades</option>
        <option value="alta">Prioridad alta</option>
        <option value="media">Prioridad media</option>
        <option value="baja">Prioridad baja</option>
      </select>

      <select
        value={filtros.estado}
        onChange={(e) =>
          onCambiarFiltros({
            estado: e.target.value as FiltrosInterconsulta["estado"],
          })
        }
        disabled={deshabilitado}
        className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="todos">Todos los estados</option>
        <option value="pendiente">Pendiente</option>
        <option value="revisada">Revisada</option>
      </select>

      {deshabilitado && (
        <span className="ml-auto text-xs text-[var(--text-muted)] bg-[var(--prioridad-media-bg)] px-2 py-1 rounded">
          Filtros bloqueados: solo interconsultas revisadas
        </span>
      )}
    </div>
  );
}
