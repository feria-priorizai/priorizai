"use client";

/**
 * Información general de la interconsulta en la vista de detalle.
 * Muestra datos del paciente, especialidad, diagnóstico, motivo
 * y estado actual de la interconsulta.
 */

import type { Interconsulta } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import BadgeEstado from "@/components/ui/BadgeEstado";

interface DetalleInterconsultaProps {
  interconsulta: Interconsulta;
}

/** Formatea fecha ISO a formato legible */
function formatearFecha(fechaISO: string): string {
  return new Date(fechaISO).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
            RUT: {ic.pacienteRut} — {ic.pacienteEdad} años
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BadgePrioridad prioridad={ic.prioridadActual} tamano="lg" />
          <BadgeEstado estado={ic.estado} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
        {/* Columna izquierda */}
        <div className="flex flex-col gap-3">
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Especialidad
            </span>
            <p className="text-sm text-[var(--text-primary)]">{ic.especialidad}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Centro de origen
            </span>
            <p className="text-sm text-[var(--text-primary)]">{ic.centroOrigen}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Diagnóstico
            </span>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {ic.diagnostico}
            </p>
          </div>
        </div>

        {/* Columna derecha */}
        <div className="flex flex-col gap-3">
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Fecha de ingreso
            </span>
            <p className="text-sm text-[var(--text-primary)]">
              {formatearFecha(ic.fechaIngreso)}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Última actualización
            </span>
            <p className="text-sm text-[var(--text-primary)]">
              {formatearFecha(ic.fechaActualizacion)}
            </p>
          </div>
        </div>

        {/* Motivo de interconsulta (ocupa ancho completo) */}
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
