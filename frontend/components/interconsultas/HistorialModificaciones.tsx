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
      <div className="pz-panel">
        <div className="pz-panel__head">
          <span className="pz-eyebrow pz-eyebrow--muted">Trazabilidad</span>
          <h3 className="pz-panel__title">Historial de modificaciones</h3>
        </div>
        <div className="px-5 py-8 text-center">
          <span className="pz-label">
            Sin modificaciones manuales registradas
          </span>
        </div>
      </div>
    );
  }

  const ordenadas = [...modificaciones].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );

  return (
    <div className="pz-panel">
      <div className="pz-panel__head">
        <span className="pz-eyebrow pz-eyebrow--muted">Trazabilidad</span>
        <h3 className="pz-panel__title">Historial de modificaciones</h3>
        <p className="pz-panel__sub">
          {ordenadas.length} registrada{ordenadas.length !== 1 ? "s" : ""} · más
          recientes primero
        </p>
      </div>

      <div className="flex flex-col">
        {ordenadas.map((mod, indice) => (
          <div
            key={mod.id}
            className="flex flex-col gap-2.5 px-[1.15rem] py-4"
            style={{
              borderTop: indice === 0 ? "none" : "1px solid var(--pz-line)",
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[.85rem] font-semibold text-[var(--pz-ink)]">
                {mod.medicoResponsable}
              </span>
              <span className="pz-mono text-[.68rem] text-[var(--pz-ink-3)]">
                {formatearFechaHoraChile(mod.fecha)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <BadgePrioridad prioridad={mod.prioridadAnterior} />
              <span className="pz-mono text-[var(--pz-ink-3)]" aria-hidden="true">
                →
              </span>
              <BadgePrioridad prioridad={mod.prioridadNueva} />
              {indice === 0 && (
                <span className="pz-chip pz-chip--ink">Vigente</span>
              )}
            </div>

            <p className="text-[.85rem] leading-relaxed text-[var(--pz-ink-2)]">
              {mod.motivo}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
