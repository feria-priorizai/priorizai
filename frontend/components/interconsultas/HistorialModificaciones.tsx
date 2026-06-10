import type { ModificacionPrioridad } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import { formatearFechaHoraChile } from "@/utils/fechas";

interface HistorialModificacionesProps {
  modificaciones: ModificacionPrioridad[];
}

export default function HistorialModificaciones({
  modificaciones,
}: HistorialModificacionesProps) {
  if (modificaciones.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Historial de modificaciones
          </h3>
        </div>
        <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
          No se han realizado modificaciones manuales a esta interconsulta.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Historial de modificaciones
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          {modificaciones.length} modificacion
          {modificaciones.length !== 1 ? "es" : ""} registrada
          {modificaciones.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex flex-col divide-y divide-[var(--border-light)]">
        {[...modificaciones].reverse().map((mod) => (
          <div key={mod.id} className="flex flex-col gap-3 px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {mod.medicoResponsable}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                {formatearFechaHoraChile(mod.fecha)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <BadgePrioridad prioridad={mod.prioridadAnterior} />
              <span className="text-[var(--text-muted)]">{"->"}</span>
              <BadgePrioridad prioridad={mod.prioridadNueva} />
            </div>

            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {mod.motivo}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
