"use client";

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
      </div>
    </div>
  );
}
