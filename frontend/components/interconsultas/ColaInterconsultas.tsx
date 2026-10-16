"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type MouseEvent } from "react";
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
  ordenarPorColumna,
  type ClaveGrupo,
  type ColumnaOrden,
  type OrdenTabla,
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

  const [ordenTabla, setOrdenTabla] = useState<OrdenTabla | null>(null);

  const porGrupo = agruparPorPrioridad(interconsultas);
  const enOrdenDeLista = porGrupo.flatMap((g) => g.items);
  const filasTabla = ordenTabla
    ? ordenarPorColumna(enOrdenDeLista, ordenTabla)
    : enOrdenDeLista;
  const visibles = vista === "tabla" ? filasTabla : enOrdenDeLista;
  const claveOrden = visibles.map((ic) => ic.id).join(",");

  // Primer clic ordena ascendente, el segundo descendente y el tercero vuelve
  // al orden de la lista de espera.
  const alternarOrden = (columna: ColumnaOrden) =>
    setOrdenTabla((actual) =>
      actual?.columna !== columna
        ? { columna, descendente: false }
        : actual.descendente
          ? null
          : { columna, descendente: true },
    );

  // El detalle navega por la secuencia que se ve, filtros y orden incluidos (HDU-12).
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
          {titulo !== "Lista de espera" && (
            <span className="pz-eyebrow">Lista de espera</span>
          )}
          <h2 className="pz-panel__title">{titulo}</h2>
          <p className="pz-panel__sub">
            {vista === "tabla"
              ? "Haz clic en un encabezado para ordenar; un tercer clic vuelve al orden de la lista"
              : subtitulo}
          </p>
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
          filas={filasTabla}
          orden={ordenTabla}
          onOrdenar={alternarOrden}
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

const COLUMNAS: { clave: ColumnaOrden; titulo: string; derecha?: boolean }[] = [
  { clave: "folio", titulo: "Folio" },
  { clave: "prioridad", titulo: "Prioridad" },
  { clave: "diagnostico", titulo: "Diagnóstico" },
  { clave: "edad", titulo: "Edad", derecha: true },
  { clave: "origen", titulo: "Origen" },
  { clave: "destino", titulo: "Destino" },
  { clave: "emision", titulo: "Emisión" },
  { clave: "certeza", titulo: "Certeza", derecha: true },
  { clave: "estado", titulo: "Estado" },
];

/**
 * Vista de planilla: una línea por interconsulta, cuadrícula, encabezado fijo
 * y orden por columna. El color de prioridad queda en el canto de la fila.
 */
function TablaCola({
  filas,
  orden,
  onOrdenar,
  modoDescargaMultiple,
  seleccionadas,
  onAlternar,
  onClickFila,
}: {
  filas: Interconsulta[];
  orden: OrdenTabla | null;
  onOrdenar: (columna: ColumnaOrden) => void;
  modoDescargaMultiple: boolean;
  seleccionadas: Set<string>;
  onAlternar: (id: string) => void;
  onClickFila: (e: MouseEvent<HTMLElement>, id: string) => void;
}) {
  return (
    <div className="pz-planilla custom-scrollbar">
      <table className="pz-tabla-cola">
        <thead>
          <tr>
            <th scope="col" className="pz-tabla-cola__n">
              <span className="visually-hidden">Posición</span>#
            </th>
            {modoDescargaMultiple && (
              <th scope="col">
                <span className="visually-hidden">Selección</span>
              </th>
            )}
            {COLUMNAS.map((col) => {
              const activa = orden?.columna === col.clave;
              return (
                <th
                  key={col.clave}
                  scope="col"
                  aria-sort={
                    activa ? (orden.descendente ? "descending" : "ascending") : undefined
                  }
                  className={col.derecha ? "text-end" : undefined}
                >
                  <button
                    type="button"
                    className={`pz-orden${activa ? " is-on" : ""}`}
                    onClick={() => onOrdenar(col.clave)}
                    title={`Ordenar por ${col.titulo.toLowerCase()}`}
                  >
                    {col.titulo}
                    <span aria-hidden="true" className="pz-orden__flecha">
                      {activa ? (orden.descendente ? "▼" : "▲") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
            <th scope="col" title="Bandera roja">
              <span aria-hidden="true">⚑</span>
              <span className="visually-hidden">Bandera roja</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((ic, i) => {
            const clave = grupoDe(ic);
            return (
              <tr
                key={ic.id}
                className={`pz-tabla-cola__fila--${zonaDe(clave)}${
                  seleccionadas.has(ic.id) ? " is-sel" : ""
                }`}
                onClick={(e) => onClickFila(e, ic.id)}
              >
                <td className="pz-tabla-cola__n">{i + 1}</td>
                {modoDescargaMultiple && (
                  <td>
                    <input
                      type="checkbox"
                      className="form-check-input m-0"
                      checked={seleccionadas.has(ic.id)}
                      onChange={() => onAlternar(ic.id)}
                      aria-label={`Seleccionar ${ic.id.slice(0, 8)}`}
                    />
                  </td>
                )}
                <td>
                  <Link href={`/interconsultas/${ic.id}`} className="pz-tabla-cola__folio">
                    {ic.id.slice(0, 8).toUpperCase()}
                  </Link>
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
                <td title={ic.diagnostico}>
                  {/* max-width no recorta una celda; recorta a su contenido. */}
                  <span className="pz-tabla-cola__dx">{ic.diagnostico}</span>
                </td>
                <td className="pz-tabla-cola__dato text-end">
                  {ic.pacienteEdad}
                  {ic.sexo ? ` ${ic.sexo.charAt(0).toUpperCase()}` : ""}
                </td>
                <td className="pz-tabla-cola__dato">{ic.centroOrigen}</td>
                <td className="pz-tabla-cola__dato">{ic.especialidad}</td>
                <td className="pz-tabla-cola__dato">{fechaDe(ic)}</td>
                <td className="pz-tabla-cola__dato text-end">
                  {ic.prioridadForzadaPorRegla ? "regla" : (certezaDe(ic) ?? "—")}
                </td>
                <td>
                  <BadgeEstado estado={ic.estado} />
                </td>
                <td>
                  {ic.banderaRoja && (
                    <span
                      className="pz-chip pz-chip--flag"
                      title={ic.terminosBanderaRoja.join(", ") || "Bandera roja detectada"}
                    >
                      ⚑
                      <span className="visually-hidden">
                        {" "}Bandera roja: {ic.terminosBanderaRoja.join(", ") || "detectada"}
                      </span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
