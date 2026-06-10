"use client";

import type { Interconsulta } from "@/types";
import BadgeEstado from "@/components/ui/BadgeEstado";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import { formatearFechaHoraChileLarga } from "@/utils/fechas";

interface DetalleInterconsultaProps {
  interconsulta: Interconsulta;
}

export default function DetalleInterconsulta({
  interconsulta: ic,
}: DetalleInterconsultaProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {ic.pacienteNombre}
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            RUT: {ic.pacienteRut} - {ic.pacienteEdad} años
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ic.esValidaParaPriorizacion !== false && (
            <BadgePrioridad prioridad={ic.prioridadActual} tamano="lg" />
          )}
          <BadgeEstado estado={ic.estado} />
        </div>
      </div>

      {ic.esValidaParaPriorizacion === false && (
        <div className="border-b border-[var(--border)] bg-[var(--prioridad-media-bg)] px-5 py-3">
          <p className="text-sm font-medium text-[var(--prioridad-media)]">
            Interconsulta invalida para priorizacion IA
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            No contiene antecedentes clinicos suficientes para ejecutar el
            modelo predictivo.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Especialidad
            </span>
            <p className="text-sm text-[var(--text-primary)]">{ic.especialidad}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Especialidad de origen
            </span>
            <p className="text-sm text-[var(--text-primary)]">{ic.centroOrigen}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Diagnostico
            </span>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {ic.diagnostico}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Fecha de ingreso
            </span>
            <p className="text-sm text-[var(--text-primary)]">
              {formatearFechaHoraChileLarga(ic.fechaIngreso)}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Ultima actualizacion
            </span>
            <p className="text-sm text-[var(--text-primary)]">
              {formatearFechaHoraChileLarga(ic.fechaActualizacion)}
            </p>
          </div>
        </div>

        <div className="md:col-span-2">
          <span className="text-xs font-medium text-[var(--text-muted)]">
            Motivo de interconsulta
          </span>
          <p className="mt-1 rounded-lg bg-[var(--background)] p-3 text-sm leading-relaxed text-[var(--text-primary)]">
            {ic.motivoInterconsulta}
          </p>
        </div>
      </div>
    </div>
  );
}
