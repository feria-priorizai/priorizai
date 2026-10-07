"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, type MouseEvent } from "react";
import type { Interconsulta } from "@/types";
import BadgeEstado from "@/components/ui/BadgeEstado";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import {
  formatearFechaCalendario,
  formatearFechaHoraChile,
} from "@/utils/fechas";
import {
  agruparPorPrioridad,
  grupoDe,
  guardarOrdenLista,
  type ClaveGrupo,
  type VistaLista,
} from "@/utils/ordenLista";

type FormatoDescarga = "json" | "csv" | "xlsx";

interface ColaInterconsultasProps {
  interconsultas: Interconsulta[];
  titulo?: string;
  subtitulo?: string;
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
  /** Mensaje personalizado cuando la lista está vacía.
   *  Si no se proporciona, usa el genérico "No se encontraron interconsultas". */
  mensajeVacio?: string;
  /** Tarjetas agrupadas o tabla (HDU-14). Sin `onCambiarVista` no hay selector. */
  vista?: VistaLista;
  onCambiarVista?: (vista: VistaLista) => void;
}

/** Zona de color que corresponde a cada grupo: inválidas y sin priorizar comparten el neutro. */
const zonaDe = (clave: ClaveGrupo) =>
  clave === "sin" || clave === "invalida" ? "sin" : clave;

function fechaDe(ic: Interconsulta): string {
  return ic.fechaEmision
    ? formatearFechaCalendario(ic.fechaEmision)
    : formatearFechaHoraChile(ic.fechaIngreso);
}

/** Certeza del modelo, o la regla clínica que la reemplazó; null si no se priorizó. */
function certezaDe(ic: Interconsulta): string | null {
  if (ic.prioridadForzadaPorRegla) return "regla clínica";
  if (ic.priorizacionIA.priorizada ?? true) return `${ic.priorizacionIA.confianza}%`;
  return null;
}

/**
 * Lista de espera agrupada por prioridad. El orden dentro de cada grupo es el
 * que resuelve el backend (HU3-c1 y c3: prioridad, luego fecha de emisión, luego
 * id); agrupar no lo altera, solo lo hace legible de un vistazo. La tabla
 * recorre exactamente el mismo orden.
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
  mensajeVacio,
  vista = "tarjetas",
  onCambiarVista,
}: ColaInterconsultasProps) {
  const router = useRouter();
  const idBase = useId();

  const porGrupo = agruparPorPrioridad(interconsultas);
  const ordenIds = porGrupo.flatMap((g) => g.items.map((ic) => ic.id));
  const claveOrden = ordenIds.join(",");

  // El detalle navega por esta misma secuencia, filtros incluidos (HDU-12).
  useEffect(() => {
    guardarOrdenLista(claveOrden ? claveOrden.split(",") : []);
  }, [claveOrden]);

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
  const alClickearFila = (e: MouseEvent<HTMLElement>, id: string) => {
    if ((e.target as HTMLElement).closest("a, button, input")) return;
    if (window.getSelection()?.toString()) return;
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
          <h2 className="pz-panel__title">{titulo}</h2>
          <p className="pz-panel__sub">{subtitulo}</p>
        </div>

        <div className="pz-form flex flex-wrap items-center gap-2">
          {onCambiarVista && (
            <SelectorVista vista={vista} onCambiar={onCambiarVista} />
          )}
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
                className="pz-btn pz-btn--azul pz-btn--mini"
              >
                Descargar ({seleccionadas.size})
              </button>
              <button
                type="button"
                onClick={onCancelarDescargaMultiple}
                className="pz-btn pz-btn--claro pz-btn--mini"
              >
                Cancelar
              </button>
            </>
          ) : mostrarBotonDescargaMultiple && onActivarDescargaMultiple ? (
            <button
              type="button"
              onClick={onActivarDescargaMultiple}
              className="pz-btn pz-btn--morado pz-btn--mini"
            >
              Descargar múltiples
            </button>
          ) : null}
        </div>
      </div>

      {porGrupo.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <span className="pz-label">
            {mensajeVacio ?? "No se encontraron interconsultas"}
          </span>
        </div>
      ) : vista === "tabla" ? (
        <TablaCola
          grupos={porGrupo}
          modoDescargaMultiple={modoDescargaMultiple}
          seleccionadas={seleccionadas}
          onAlternar={alternarSeleccion}
          onClickFila={alClickearFila}
        />
      ) : (
        porGrupo.map((grupo) => (
          <section
            key={grupo.clave}
            aria-labelledby={`${idBase}-${grupo.clave}`}
            className={`pz-zona pz-zona--${zonaDe(grupo.clave)}`}
          >
            <div className="pz-grupo">
              <h3 id={`${idBase}-${grupo.clave}`} className="pz-grupo__t">
                {grupo.titulo}
              </h3>
              <span className="pz-grupo__n">{grupo.items.length}</span>
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
                    className="pz-mono font-bold tracking-[.04em] text-[var(--pz-blue-deep)]"
                    style={{ fontSize: "var(--fs-sm)" }}
                  >
                    {ic.id.slice(0, 8).toUpperCase()}
                  </Link>
                  <span className="pz-label mt-1">{ic.pacienteEdad} años</span>
                </div>

                <div className="pz-fila-cola__cuerpo">
                  <span className="pz-fila-cola__dx">{ic.diagnostico}</span>
                  <span className="pz-fila-cola__meta">
                    {ic.centroOrigen} → {ic.especialidad} · {fechaDe(ic)}
                    {ic.prioridadForzadaPorRegla
                      ? " · regla clínica"
                      : certezaDe(ic) && ` · certeza ${certezaDe(ic)}`}
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

function SelectorVista({
  vista,
  onCambiar,
}: {
  vista: VistaLista;
  onCambiar: (vista: VistaLista) => void;
}) {
  const opciones: { valor: VistaLista; etiqueta: string; icono: string }[] = [
    { valor: "tarjetas", etiqueta: "Tarjetas", icono: "M4 5h16v4H4zM4 11h16v4H4zM4 17h16v2H4z" },
    { valor: "tabla", etiqueta: "Tabla", icono: "M4 5h16v14H4zM4 10h16M4 14.5h16M10 5v14" },
  ];

  return (
    <div className="pz-vista" role="group" aria-label="Forma de ver la lista">
      {opciones.map((op) => (
        <button
          key={op.valor}
          type="button"
          className={`pz-vista__op${vista === op.valor ? " is-on" : ""}`}
          aria-pressed={vista === op.valor}
          onClick={() => onCambiar(op.valor)}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d={op.icono} />
          </svg>
          {op.etiqueta}
        </button>
      ))}
    </div>
  );
}

const ETIQUETA_SIN_PRIORIDAD: Partial<Record<ClaveGrupo, string>> = {
  sin: "Sin priorizar",
  invalida: "No priorizable",
};

function TablaCola({
  grupos,
  modoDescargaMultiple,
  seleccionadas,
  onAlternar,
  onClickFila,
}: {
  grupos: ReturnType<typeof agruparPorPrioridad>;
  modoDescargaMultiple: boolean;
  seleccionadas: Set<string>;
  onAlternar: (id: string) => void;
  onClickFila: (e: MouseEvent<HTMLElement>, id: string) => void;
}) {
  return (
    <div className="table-responsive custom-scrollbar">
      <table className="table pz-table pz-tabla-cola">
        <thead>
          <tr>
            {modoDescargaMultiple && (
              <th scope="col">
                <span className="visually-hidden">Selección</span>
              </th>
            )}
            <th scope="col">Folio</th>
            <th scope="col">Prioridad</th>
            <th scope="col">Diagnóstico</th>
            <th scope="col">Origen → destino</th>
            <th scope="col">Emisión</th>
            <th scope="col" className="text-end">Certeza</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {grupos.flatMap((grupo) =>
            grupo.items.map((ic) => {
              const clave = grupoDe(ic);
              return (
                <tr
                  key={ic.id}
                  className={`pz-tabla-cola__fila pz-tabla-cola__fila--${zonaDe(clave)}`}
                  onClick={(e) => onClickFila(e, ic.id)}
                >
                  {modoDescargaMultiple && (
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={seleccionadas.has(ic.id)}
                        onChange={() => onAlternar(ic.id)}
                        aria-label={`Seleccionar ${ic.id.slice(0, 8)}`}
                      />
                    </td>
                  )}
                  <td>
                    <Link
                      href={`/interconsultas/${ic.id}`}
                      className="pz-mono font-bold tracking-[.04em] text-[var(--pz-blue-deep)]"
                      style={{ fontSize: "var(--fs-sm)" }}
                    >
                      {ic.id.slice(0, 8).toUpperCase()}
                    </Link>
                    <span className="pz-label d-block mt-1">
                      {ic.pacienteEdad} años
                    </span>
                  </td>
                  <td>
                    {ETIQUETA_SIN_PRIORIDAD[clave] ? (
                      <span className="pz-chip pz-chip--neutral">
                        {ETIQUETA_SIN_PRIORIDAD[clave]}
                      </span>
                    ) : (
                      <BadgePrioridad prioridad={ic.prioridadActual} />
                    )}
                  </td>
                  <td className="pz-tabla-cola__dx">
                    {ic.diagnostico}
                    {ic.banderaRoja && (
                      <span
                        className="pz-chip pz-chip--flag ms-2"
                        title={
                          ic.terminosBanderaRoja.join(", ") ||
                          "Bandera roja detectada"
                        }
                      >
                        ⚑ {ic.terminosBanderaRoja[0] ?? "bandera roja"}
                      </span>
                    )}
                  </td>
                  <td className="pz-mono-cell">
                    {ic.centroOrigen}
                    <span className="d-block">→ {ic.especialidad}</span>
                  </td>
                  <td className="pz-mono-cell text-nowrap">{fechaDe(ic)}</td>
                  <td className="pz-mono-cell text-end text-nowrap">
                    {certezaDe(ic) ?? "—"}
                  </td>
                  <td>
                    <BadgeEstado estado={ic.estado} />
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}
