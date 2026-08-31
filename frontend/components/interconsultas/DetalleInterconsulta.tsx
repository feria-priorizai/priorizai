"use client";

import type { ReactNode } from "react";
import type { Interconsulta } from "@/types";
import BadgeEstado from "@/components/ui/BadgeEstado";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import BadgeBanderaRoja from "@/components/ui/BadgeBanderaRoja";
import { formatearFechaHoraChileLarga } from "@/utils/fechas";

interface DetalleInterconsultaProps {
  interconsulta: Interconsulta;
}

export default function DetalleInterconsulta({
  interconsulta: ic,
}: DetalleInterconsultaProps) {
  return (
    <div className="pz-panel">
      <div className="pz-panel__head">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="pz-eyebrow">Folio</span>
            <h3 className="pz-mono mt-1.5 text-[1.15rem] font-semibold tracking-[.04em] text-[var(--pz-ink)]">
              {ic.id.slice(0, 8).toUpperCase()}
            </h3>
            <p className="pz-panel__sub">
              {ic.pacienteEdad} años · {ic.centroOrigen} → {ic.especialidad}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {ic.esValidaParaPriorizacion !== false &&
              (ic.sinPrioridad ? (
                <span className="pz-label">Sin prioridad</span>
              ) : (
                <BadgePrioridad prioridad={ic.prioridadActual} tamano="lg" />
              ))}
            <BadgeEstado estado={ic.estado} />
          </div>
        </div>

        {ic.banderaRoja && (
          <div className="mt-3">
            <BadgeBanderaRoja terminos={ic.terminosBanderaRoja} tamano="lg" />
          </div>
        )}
      </div>

      {ic.esValidaParaPriorizacion === false && (
        <div
          className="px-[1.15rem] py-3"
          style={{
            background: "var(--pz-media-bg)",
            borderBottom: "1px solid var(--pz-line)",
          }}
        >
          <span className="pz-eyebrow" style={{ color: "var(--pz-media)" }}>
            Inválida para priorización
          </span>
          <p className="mt-1.5 text-[.88rem] text-[var(--pz-ink-2)]">
            No contiene antecedentes clínicos suficientes para ejecutar el
            modelo predictivo.
          </p>
        </div>
      )}

      <div className="pz-panel__body">
        <div className="row g-4">
          <div className="col-12 col-md-6">
            <Dato etiqueta="Especialidad de destino">{ic.especialidad}</Dato>
            <Dato etiqueta="Especialidad de origen">{ic.centroOrigen}</Dato>
            <Dato etiqueta="Diagnóstico" destacado>
              {ic.diagnostico}
            </Dato>
          </div>

          <div className="col-12 col-md-6">
            <Dato etiqueta="Fecha de emisión">
              {ic.fechaEmision
                ? formatearFechaHoraChileLarga(ic.fechaEmision)
                : "No registrada"}
            </Dato>
            <Dato etiqueta="Ingreso al sistema">
              {formatearFechaHoraChileLarga(ic.fechaIngreso)}
            </Dato>
            <Dato etiqueta="Última actualización">
              {formatearFechaHoraChileLarga(ic.fechaActualizacion)}
            </Dato>
          </div>
        </div>

        <div className="mt-4">
          <span className="pz-label">Motivo de interconsulta</span>
          <p
            className="mt-2 p-3 text-[.9rem] leading-relaxed text-[var(--pz-ink)]"
            style={{
              background: "var(--pz-paper-2)",
              borderLeft: "2px solid var(--pz-line-2)",
            }}
          >
            {ic.motivoInterconsulta}
          </p>
        </div>
      </div>
    </div>
  );
}

function Dato({
  etiqueta,
  children,
  destacado = false,
}: {
  etiqueta: string;
  children: ReactNode;
  destacado?: boolean;
}) {
  return (
    <div className="mb-3.5 last:mb-0">
      <span className="pz-label">{etiqueta}</span>
      <p
        className={`mt-1 text-[.9rem] ${
          destacado
            ? "font-semibold text-[var(--pz-ink)]"
            : "text-[var(--pz-ink-2)]"
        }`}
      >
        {children}
      </p>
    </div>
  );
}
