"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import type { Interconsulta, NivelPrioridad } from "@/types";
import BadgeEstado from "@/components/ui/BadgeEstado";
import { formatearFechaHoraChile } from "@/utils/fechas";

type FormatoDescarga = "json" | "csv" | "xlsx";
type ClaveGrupo = NivelPrioridad | "sin" | "invalida";

interface ColaInterconsultasProps {
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
  mostrarBotonDescargaMultiple?: boolean;
}

const GRUPOS: { clave: ClaveGrupo; titulo: string }[] = [
  { clave: "alta", titulo: "Alta" },
  { clave: "media", titulo: "Media" },
  { clave: "baja", titulo: "Baja" },
  { clave: "sin", titulo: "Sin priorizar" },
  { clave: "invalida", titulo: "No priorizables" },
];

function grupoDe(ic: Interconsulta): ClaveGrupo {
  if (ic.esValidaParaPriorizacion === false) return "invalida";
  if (ic.sinPrioridad) return "sin";
  return ic.prioridadActual;
}

/**
 * Lista de espera agrupada por prioridad. El orden dentro de cada grupo es el
 * que resuelve el backend (HU3-c1 y c3: prioridad, luego fecha de emisión, luego
 * id); agrupar no lo altera, solo lo hace legible de un vistazo.
 */
export default function ColaInterconsultas({
  interconsultas,
  titulo = "Lista de espera",
  subtitulo = "Agrupadas por prioridad; dentro de cada grupo, por fecha de emisión",
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
}: ColaInterconsultasProps) {
  const router = useRouter();

  const todasSeleccionadas =
    interconsultas.length > 0 &&
    interconsultas.every((ic) => seleccionadas.has(ic.id));

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

  // La fila completa abre el detalle; el folio sigue siendo el enlace real para
  // teclado, menú contextual y cmd+click. En modo descarga alterna la selección.
  const alClickearFila = (e: MouseEvent<HTMLDivElement>, id: string) => {
    if ((e.target as HTMLElement).closest("a, button, input")) return;
    if (window.getSelection()?.toString()) return;
    if (modoDescargaMultiple) {
      alternarSeleccion(id);
      return;
    }
    router.push(`/interconsultas/${id}`);
  };

  const porGrupo = GRUPOS.map((g) => ({
    ...g,
    items: interconsultas.filter((ic) => grupoDe(ic) === g.clave),
  })).filter((g) => g.items.length > 0);

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
              <label className="pz-campo" style={{ padding: ".45rem .7rem" }}>
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={todasSeleccionadas}
                  onChange={onToggleSeleccionarTodas}
                  disabled={interconsultas.length === 0}
                />
                <span className="pz-label">Todas</span>
              </label>
              <select
                aria-label="Formato de descarga"
                className="form-select pz-select--mini"
                value={formatoDescarga}
                onChange={(e) =>
                  onCambiarFormatoDescarga?.(e.target.value as FormatoDescarga)
                }
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </select>
              <button
                type="button"
                onClick={onDescargarSeleccion}
                disabled={seleccionadas.size === 0}
                className="pz-btn pz-btn--solid pz-btn--mini"
              >
                Descargar ({seleccionadas.size})
              </button>
              <button
                type="button"
                onClick={onCancelarDescargaMultiple}
                className="pz-btn pz-btn--ghost pz-btn--mini"
              >
                Cancelar
              </button>
            </>
          ) : mostrarBotonDescargaMultiple && onActivarDescargaMultiple ? (
            <button
              type="button"
              onClick={onActivarDescargaMultiple}
              className="pz-btn pz-btn--ghost pz-btn--mini"
            >
              Descargar múltiples
            </button>
          ) : null}
        </div>
      </div>

      {porGrupo.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <span className="pz-label">No se encontraron interconsultas</span>
        </div>
      ) : (
        porGrupo.map((grupo) => (
          <section key={grupo.clave}>
            <div
              className={`pz-grupo pz-grupo--${
                grupo.clave === "sin" || grupo.clave === "invalida"
                  ? "sin"
                  : grupo.clave
              }`}
            >
              <span className="pz-grupo__barra" aria-hidden="true" />
              <span className="pz-grupo__t">{grupo.titulo}</span>
              <span className="pz-grupo__n">· {grupo.items.length}</span>
              <span className="pz-grupo__regla" aria-hidden="true" />
            </div>

            {grupo.items.map((ic) => (
              <div
                key={ic.id}
                className="pz-fila-cola"
                onClick={(e) => alClickearFila(e, ic.id)}
              >
                {modoDescargaMultiple && (
                  <input
                    type="checkbox"
                    className="form-check-input mt-1 flex-none"
                    checked={seleccionadas.has(ic.id)}
                    onChange={() => alternarSeleccion(ic.id)}
                    aria-label={`Seleccionar ${ic.id.slice(0, 8)}`}
                  />
                )}

                <div className="pz-fila-cola__id">
                  <Link
                    href={`/interconsultas/${ic.id}`}
                    className="pz-mono text-[.74rem] font-semibold tracking-[.04em] text-[var(--pz-blue-deep)]"
                  >
                    {ic.id.slice(0, 8).toUpperCase()}
                  </Link>
                  <span className="pz-label mt-1">{ic.pacienteEdad} años</span>
                </div>

                <div className="pz-fila-cola__cuerpo">
                  <span className="pz-fila-cola__dx">{ic.diagnostico}</span>
                  <span className="pz-fila-cola__meta">
                    {ic.centroOrigen} → {ic.especialidad} ·{" "}
                    {formatearFechaHoraChile(ic.fechaEmision ?? ic.fechaIngreso)}
                    {ic.prioridadForzadaPorRegla && " · regla clínica"}
                    {!ic.prioridadForzadaPorRegla &&
                      (ic.priorizacionIA.priorizada ?? true) &&
                      ` · certeza ${ic.priorizacionIA.confianza}%`}
                  </span>
                </div>

                <div className="pz-fila-cola__lado">
                  <BadgeEstado estado={ic.estado} />
                  {ic.banderaRoja && (
                    <span
                      className="pz-chip pz-chip--flag"
                      title={
                        ic.terminosBanderaRoja.join(", ") ||
                        "Bandera roja detectada"
                      }
                    >
                      ⚑ {ic.terminosBanderaRoja[0] ?? "bandera roja"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
