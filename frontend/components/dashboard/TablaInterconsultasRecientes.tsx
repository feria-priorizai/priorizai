"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import type { Interconsulta } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import BadgeBanderaRoja from "@/components/ui/BadgeBanderaRoja";
import BadgeEstado from "@/components/ui/BadgeEstado";
import { formatearFechaHoraChile } from "@/utils/fechas";

interface TablaInterconsultasRecientesProps {
  interconsultas: Interconsulta[];
  titulo?: string;
  subtitulo?: string;
}

export default function TablaInterconsultasRecientes({
  interconsultas,
  titulo = "Interconsultas",
  subtitulo = "Ordenadas por prioridad y fecha de emisión",
}: TablaInterconsultasRecientesProps) {
  const router = useRouter();

  // La fila completa abre el detalle. El enlace del folio se mantiene porque es
  // el que da navegacion por teclado, menu contextual y cmd+click; el handler
  // se aparta cuando el click nacio de un elemento interactivo o de seleccionar
  // texto, para no pisar esos comportamientos.
  const abrirDetalle = (
    e: MouseEvent<HTMLTableRowElement>,
    id: string,
  ) => {
    if ((e.target as HTMLElement).closest("a, button")) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    router.push(`/interconsultas/${id}`);
  };

  // HU3-c1 y c3: el orden lo resuelve el backend (prioridad descendente ->
  // fecha de emision ascendente -> id). No se reordena en el cliente: hacerlo
  // duplicaba el criterio y lo contradecia, ordenando por fecha de ingreso
  // descendente y anulando el orden correcto que ya venia de la API.
  const ordenadas = interconsultas;

  return (
    <div className="pz-panel">
      <div className="pz-panel__head">
        <span className="pz-eyebrow">Lista de espera</span>
        <h3 className="pz-panel__title">{titulo}</h3>
        <p className="pz-panel__sub">{subtitulo}</p>
      </div>

      <div className="custom-scrollbar" style={{ overflowX: "auto" }}>
        <table className="table pz-table align-middle">
          <thead>
            <tr>
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
                  onClick={(e) => abrirDetalle(e, ic.id)}
                  className="pz-fila"
                >
                  <td className={`pz-edge ${nivelBorde}`}>
                    <Link
                      href={`/interconsultas/${ic.id}`}
                      className="pz-mono text-[.74rem] font-semibold tracking-[.04em] text-[var(--pz-blue-deep)]"
                    >
                      {ic.id.slice(0, 8).toUpperCase()}
                    </Link>
                    <span className="pz-label mt-1">
                      {ic.pacienteEdad} años
                    </span>
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
