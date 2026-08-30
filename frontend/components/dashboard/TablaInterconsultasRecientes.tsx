"use client";

import Link from "next/link";
import type { Interconsulta } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import BadgeBanderaRoja from "@/components/ui/BadgeBanderaRoja";
import BadgeEstado from "@/components/ui/BadgeEstado";
import { formatearFechaHoraChile } from "@/utils/fechas";
import { IconoDescargar, IconoX } from "@/components/configuracion/iconos";

interface TablaInterconsultasRecientesProps {
  interconsultas: Interconsulta[];
  /** Modo descarga múltiple activado */
  modoDescargaMultiple?: boolean;
  /** IDs de interconsultas seleccionadas */
  seleccionadas?: Set<string>;
  /** Callback cuando cambia la selección */
  onCambiarSeleccion?: (ids: Set<string>) => void;
  /** Callback para alternar selección de todas las visibles */
  onToggleSeleccionarTodas?: () => void;
  /** Callback para descargar la selección */
  onDescargarSeleccion?: () => void;
  /** Callback para cancelar modo descarga múltiple */
  onCancelarDescargaMultiple?: () => void;
  /** Callback para activar modo descarga múltiple */
  onActivarDescargaMultiple?: () => void;
  /** Formato de descarga seleccionado */
  formatoDescarga?: "json" | "csv" | "xlsx";
  /** Callback cuando cambia el formato de descarga */
  onCambiarFormatoDescarga?: (formato: "json" | "csv" | "xlsx") => void;
  /** Mostrar botón de descarga múltiple (por defecto true, false en dashboard) */
  mostrarBotonDescargaMultiple?: boolean;
}

export default function TablaInterconsultasRecientes({
  interconsultas,
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
  // HU3-c1 y c3: el orden lo resuelve el backend (prioridad descendente ->
  // fecha de emision ascendente -> id). No se reordena en el cliente: hacerlo
  // duplicaba el criterio y lo contradecia, ordenando por fecha de ingreso
  // descendente y anulando el orden correcto que ya venia de la API.
  const ordenadas = interconsultas;

  const todasSeleccionadas = ordenadas.length > 0 && ordenadas.every((ic) => seleccionadas.has(ic.id));

  const manejarToggleSeleccion = (id: string) => {
    if (!onCambiarSeleccion) return;
    const nuevas = new Set(seleccionadas);
    if (nuevas.has(id)) {
      nuevas.delete(id);
    } else {
      nuevas.add(id);
    }
    onCambiarSeleccion(nuevas);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Interconsultas recientes
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Ordenadas por prioridad y fecha de ingreso
          </p>
        </div>

        {/* Botones de modo descarga múltiple */}
        <div className="flex items-center gap-2">
          {modoDescargaMultiple ? (
            <>
              <select
                value={formatoDescarga}
                onChange={(e) => onCambiarFormatoDescarga?.(e.target.value as "json" | "csv" | "xlsx")}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </select>
              <button
                type="button"
                onClick={onDescargarSeleccion}
                disabled={seleccionadas.size === 0}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IconoDescargar className="h-3.5 w-3.5" />
                <span>Descargar selección ({seleccionadas.size})</span>
              </button>
              <button
                type="button"
                onClick={onCancelarDescargaMultiple}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <IconoX className="h-3.5 w-3.5" />
                <span>Cancelar</span>
              </button>
            </>
          ) : mostrarBotonDescargaMultiple && onActivarDescargaMultiple ? (
            <button
              type="button"
              onClick={() => onActivarDescargaMultiple?.()}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <IconoDescargar className="h-3.5 w-3.5" />
              <span>Descargar múltiples</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              {modoDescargaMultiple && (
                <th className="w-12 px-5 py-3 font-medium text-[var(--text-secondary)] text-center">
                  <input
                    type="checkbox"
                    checked={todasSeleccionadas}
                    onChange={onToggleSeleccionarTodas}
                    disabled={ordenadas.length === 0}
                    className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                    aria-label={todasSeleccionadas ? "Deseleccionar todas" : "Seleccionar todas"}
                  />
                </th>
              )}
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Paciente
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                RUT
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Diagnostico
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Prioridad
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Estado
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Confianza IA
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Fecha ingreso
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((ic) => (
              <tr
                key={ic.id}
                className="border-b border-[var(--border-light)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                {modoDescargaMultiple && (
                  <td className="w-12 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={seleccionadas.has(ic.id)}
                      onChange={() => manejarToggleSeleccion(ic.id)}
                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                    />
                  </td>
                )}
                <td className="px-5 py-3">
                  <Link
                    href={`/interconsultas/${ic.id}`}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    {ic.pacienteNombre}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[var(--text-secondary)]">
                  {ic.pacienteRut}
                </td>
                <td className="max-w-[200px] truncate px-5 py-3 text-[var(--text-secondary)]">
                  {ic.diagnostico}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-col items-start gap-1">
                    {ic.esValidaParaPriorizacion === false ? (
                      <span className="text-sm text-[var(--text-muted)]">
                        No aplica
                      </span>
                    ) : ic.sinPrioridad ? (
                      <span className="text-sm text-[var(--text-muted)]">
                        Sin prioridad
                      </span>
                    ) : (
                      <BadgePrioridad prioridad={ic.prioridadActual} />
                    )}
                    {ic.banderaRoja && (
                      <BadgeBanderaRoja terminos={ic.terminosBanderaRoja} />
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <BadgeEstado estado={ic.estado} />
                </td>
                <td className="px-5 py-3">
                  {ic.esValidaParaPriorizacion === false ? (
                    <span className="inline-flex rounded-full border border-[var(--prioridad-media-border)] bg-[var(--prioridad-media-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--prioridad-media)]">
                      Interconsulta invalida
                    </span>
                  ) : ic.prioridadForzadaPorRegla ? (
                    <span className="text-sm font-semibold text-[var(--prioridad-alta)]">
                      Regla clinica
                    </span>
                  ) : ic.priorizacionIA.priorizada ?? true ? (
                    <span className="text-sm font-semibold">
                      {ic.priorizacionIA.confianza}%
                    </span>
                  ) : (
                    <span
                      className="text-sm text-[var(--text-muted)]"
                      title={ic.motivoSinPrioridad ?? undefined}
                    >
                      Sin priorizar
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-[var(--text-secondary)]">
                  {formatearFechaHoraChile(ic.fechaIngreso)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ordenadas.length === 0 && (
        <div className="px-5 py-12 text-center text-[var(--text-muted)]">
          No se encontraron interconsultas.
        </div>
      )}
    </div>
  );
}
