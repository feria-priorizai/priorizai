"use client";

import type { FiltrosInterconsulta } from "@/hooks/useInterconsultas";

interface FiltrosInterconsultasProps {
  filtros: FiltrosInterconsulta;
  onCambiarFiltros: (nuevosFiltros: Partial<FiltrosInterconsulta>) => void;
  deshabilitado?: boolean;
  hayFiltrosActivos?: boolean;
  onLimpiar?: () => void;
  visibles?: number;
  total?: number;
}

export default function FiltrosInterconsultas({
  filtros,
  onCambiarFiltros,
  deshabilitado = false,
  hayFiltrosActivos = false,
  onLimpiar,
  visibles,
  total,
}: FiltrosInterconsultasProps) {
  return (
    <div className="pz-panel pz-form">
      <div className="pz-panel__body">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-lg-6">
            <label htmlFor="filtro-busqueda" className="form-label">
              Buscar
            </label>
            <input
              id="filtro-busqueda"
              type="search"
              className="form-control"
              placeholder="Folio, diagnóstico, especialidad o motivo…"
              value={filtros.busqueda}
              disabled={deshabilitado}
              onChange={(e) => onCambiarFiltros({ busqueda: e.target.value })}
            />
          </div>

          <div className="col-6 col-lg-3">
            <label htmlFor="filtro-prioridad" className="form-label">
              Prioridad
            </label>
            <select
              id="filtro-prioridad"
              className="form-select"
              value={filtros.prioridad}
              disabled={deshabilitado}
              onChange={(e) =>
                onCambiarFiltros({
                  prioridad: e.target.value as FiltrosInterconsulta["prioridad"],
                })
              }
            >
              <option value="todas">Todas</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
              <option value="sin">Sin priorizar</option>
            </select>
          </div>

          <div className="col-6 col-lg-3">
            <label htmlFor="filtro-estado" className="form-label">
              Estado
            </label>
            <select
              id="filtro-estado"
              className="form-select"
              value={filtros.estado}
              disabled={deshabilitado}
              onChange={(e) =>
                onCambiarFiltros({
                  estado: e.target.value as FiltrosInterconsulta["estado"],
                })
              }
            >
              <option value="todos">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="revisada">Revisada</option>
            </select>
          </div>
        </div>

        {deshabilitado && (
          <p className="pz-eyebrow pz-eyebrow--muted mt-3">
            Filtros bloqueados · solo interconsultas revisadas
          </p>
        )}

        {!deshabilitado && hayFiltrosActivos && (
          <div
            className="mt-3 flex flex-wrap items-center gap-3 px-3 py-2"
            style={{
              background: "var(--pz-media-bg)",
              borderLeft: "2px solid var(--pz-media)",
            }}
          >
            <span
              className="pz-mono text-[.7rem]"
              style={{ color: "var(--pz-media)" }}
            >
              Filtro activo
              {visibles !== undefined && total !== undefined
                ? `: se ocultan ${total - visibles} de ${total}`
                : ""}
            </span>
            {onLimpiar && (
              <button
                type="button"
                onClick={onLimpiar}
                className="pz-btn pz-btn--azul pz-btn--mini ms-auto"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
