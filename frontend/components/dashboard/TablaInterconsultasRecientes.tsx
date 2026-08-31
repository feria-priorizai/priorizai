"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import type { Interconsulta } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import BadgeBanderaRoja from "@/components/ui/BadgeBanderaRoja";
import BadgeEstado from "@/components/ui/BadgeEstado";
import { formatearFechaHoraChile } from "@/utils/fechas";

type FormatoDescarga = "json" | "csv" | "xlsx";

interface TablaInterconsultasRecientesProps {
  interconsultas: Interconsulta[];
  titulo?: string;
  subtitulo?: string;
  /** HU13: modo de descarga múltiple con selección por fila. */
  modoDescargaMultiple?: boolean;
  seleccionadas?: Set<string>;
  onCambiarSeleccion?: (ids: Set<string>) => void;
  onToggleSeleccionarTodas?: () => void;
  onDescargarSeleccion?: () => void;
  onCancelarDescargaMultiple?: () => void;
  onActivarDescargaMultiple?: () => void;
  formatoDescarga?: FormatoDescarga;
  onCambiarFormatoDescarga?: (formato: FormatoDescarga) => void;
  /** El panel no ofrece descarga múltiple; el listado sí. */
  mostrarBotonDescargaMultiple?: boolean;
}

export default function TablaInterconsultasRecientes({
  interconsultas,
  titulo = "Interconsultas",
  subtitulo = "Ordenadas por prioridad y fecha de emisión",
  modoDescargaMultiple = false,
  seleccionadas = new Set(),
  onCambiarSeleccion,
  onToggleSeleccionarTodas,
  onDescargarSeleccion,
  onCancelarDescargaMultiple,
  onActivarDescargaMultiple,
  formatoDescarga = "csv",
  onCambiarFormatoDescarga,
  mostrarBotonDescargaMultiple = true,
}: TablaInterconsultasRecientesProps) {
  const router = useRouter();

  // HU3-c1 y c3: el orden lo resuelve el backend (prioridad descendente ->
  // fecha de emision ascendente -> id). No se reordena en el cliente: hacerlo
  // duplicaba el criterio y lo contradecia, ordenando por fecha de ingreso
  // descendente y anulando el orden correcto que ya venia de la API.
  const ordenadas = interconsultas;

  const todasSeleccionadas =
    ordenadas.length > 0 && ordenadas.every((ic) => seleccionadas.has(ic.id));

  const alternarSeleccion = (id: string) => {
    if (!onCambiarSeleccion) return;
    const nuevas = new Set(seleccionadas);
    if (nuevas.has(id)) {
      nuevas.delete(id);
    } else {
      nuevas.add(id);
    }
    onCambiarSeleccion(nuevas);
  };

  // La fila completa abre el detalle. El enlace del folio se mantiene porque es
  // el que da navegacion por teclado, menu contextual y cmd+click; el handler
  // se aparta cuando el click nacio de un elemento interactivo o de seleccionar
  // texto. En modo descarga la fila alterna la seleccion en vez de navegar.
  const alClickearFila = (e: MouseEvent<HTMLTableRowElement>, id: string) => {
    if ((e.target as HTMLElement).closest("a, button, input")) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    if (modoDescargaMultiple) {
      alternarSeleccion(id);
      return;
    }
    router.push(`/interconsultas/${id}`);
  };

  return (
    <div className="pz-panel">
      <div className="pz-panel__head flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="pz-eyebrow">Lista de espera</span>
          <h3 className="pz-panel__title">{titulo}</h3>
          <p className="pz-panel__sub">{subtitulo}</p>
        </div>

        <div className="pz-form flex flex-wrap items-center gap-2">
          {modoDescargaMultiple ? (
            <>
              <select
                value={formatoDescarga}
                aria-label="Formato de descarga"
                onChange={(e) =>
                  onCambiarFormatoDescarga?.(e.target.value as FormatoDescarga)
                }
                className="form-select w-auto"
                style={{ fontSize: ".8rem", padding: ".4rem 2rem .4rem .6rem" }}
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </select>
              <button
                type="button"
                onClick={onDescargarSeleccion}
                disabled={seleccionadas.size === 0}
                className="pz-btn pz-btn--solid"
                style={{ padding: ".5rem .9rem", fontSize: ".68rem" }}
              >
                Descargar ({seleccionadas.size})
              </button>
              <button
                type="button"
                onClick={onCancelarDescargaMultiple}
                className="pz-btn pz-btn--ghost"
                style={{ padding: ".5rem .9rem", fontSize: ".68rem" }}
              >
                Cancelar
              </button>
            </>
          ) : mostrarBotonDescargaMultiple && onActivarDescargaMultiple ? (
            <button
              type="button"
              onClick={onActivarDescargaMultiple}
              className="pz-btn pz-btn--ghost"
              style={{ padding: ".5rem .9rem", fontSize: ".68rem" }}
            >
              Descargar múltiples
            </button>
          ) : null}
        </div>
      </div>

      <div className="custom-scrollbar" style={{ overflowX: "auto" }}>
        <table className="table pz-table align-middle">
          <thead>
            <tr>
              {modoDescargaMultiple && (
                <th scope="col" style={{ width: "2.75rem" }}>
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={todasSeleccionadas}
                    onChange={onToggleSeleccionarTodas}
                    disabled={ordenadas.length === 0}
                    aria-label={
                      todasSeleccionadas
                        ? "Deseleccionar todas"
                        : "Seleccionar todas"
                    }
                  />
                </th>
              )}
              <th scope="col">Folio</th>
              <th scope="col">Diagnóstico</th>
              <th scope="col">Derivación</th>
              <th scope="col">Prioridad</th>
              <th scope="col">Estado</th>
              <th scope="col">Certeza</th>
              <th scope="col">Emisión</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((ic) => {
              const nivelBorde =
                ic.esValidaParaPriorizacion === false || ic.sinPrioridad
                  ? ""
                  : `pz-edge--${ic.prioridadActual}`;

              return (
                <tr
                  key={ic.id}
                  onClick={(e) => alClickearFila(e, ic.id)}
                  className="pz-fila"
                >
                  {modoDescargaMultiple && (
                    <td className={`pz-edge ${nivelBorde}`}>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={seleccionadas.has(ic.id)}
                        onChange={() => alternarSeleccion(ic.id)}
                        aria-label={`Seleccionar ${ic.id.slice(0, 8)}`}
                      />
                    </td>
                  )}

                  <td className={modoDescargaMultiple ? "" : `pz-edge ${nivelBorde}`}>
                    <Link
                      href={`/interconsultas/${ic.id}`}
                      className="pz-mono text-[.74rem] font-semibold tracking-[.04em] text-[var(--pz-blue-deep)]"
                    >
                      {ic.id.slice(0, 8).toUpperCase()}
                    </Link>
                    <span className="pz-label mt-1">{ic.pacienteEdad} años</span>
                  </td>

                  <td style={{ maxWidth: "18rem" }}>
                    <span className="pz-table__dx line-clamp-2 block">
                      {ic.diagnostico}
                    </span>
                  </td>

                  <td className="pz-mono-cell">
                    {ic.centroOrigen}
                    <span className="mx-1.5" aria-hidden="true">
                      →
                    </span>
                    {ic.especialidad}
                  </td>

                  <td>
                    <div className="flex flex-col items-start gap-1.5">
                      {ic.esValidaParaPriorizacion === false ? (
                        <span className="pz-label">No aplica</span>
                      ) : ic.sinPrioridad ? (
                        <span className="pz-label">Sin prioridad</span>
                      ) : (
                        <BadgePrioridad prioridad={ic.prioridadActual} />
                      )}
                      {ic.banderaRoja && (
                        <BadgeBanderaRoja terminos={ic.terminosBanderaRoja} />
                      )}
                    </div>
                  </td>

                  <td>
                    <BadgeEstado estado={ic.estado} />
                  </td>

                  <td>
                    {ic.esValidaParaPriorizacion === false ? (
                      <span className="pz-chip pz-chip--media">Inválida</span>
                    ) : ic.prioridadForzadaPorRegla ? (
                      <span className="pz-mono text-[.72rem] font-semibold text-[var(--pz-alta)]">
                        Regla clínica
                      </span>
                    ) : (ic.priorizacionIA.priorizada ?? true) ? (
                      <span className="pz-mono text-[.85rem] font-semibold text-[var(--pz-ink)]">
                        {ic.priorizacionIA.confianza}%
                      </span>
                    ) : (
                      <span
                        className="pz-label"
                        title={ic.motivoSinPrioridad ?? undefined}
                      >
                        Sin priorizar
                      </span>
                    )}
                  </td>

                  <td className="pz-mono-cell">
                    {formatearFechaHoraChile(ic.fechaEmision ?? ic.fechaIngreso)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ordenadas.length === 0 && (
        <div className="px-5 py-12 text-center">
          <span className="pz-label">No se encontraron interconsultas</span>
        </div>
      )}
    </div>
  );
}
