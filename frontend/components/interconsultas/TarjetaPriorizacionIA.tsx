"use client";

/**
 * Tarjeta que muestra el resultado de la priorización automática (HdU01).
 * Incluye:
 * - Nivel de prioridad sugerido por el modelo
 * - Porcentaje de certeza (indicador visual)
 * - Justificación textual del modelo (HdU11 - esperado)
 *
 * Criterio de aceptación HdU01:
 * "El sistema debe mostrar claramente el porcentaje de certeza
 * en la priorización realizada."
 */

import type { ResultadoPriorizacion, NivelPrioridad } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import IndicadorConfianza from "@/components/ui/IndicadorConfianza";

interface TarjetaPriorizacionIAProps {
  priorizacion: ResultadoPriorizacion;
  /** Prioridad actual (puede diferir si fue modificada manualmente) */
  prioridadActual: NivelPrioridad;
  /** Indica si la prioridad fue modificada respecto a la sugerencia IA */
  fueModificada: boolean;
}

export default function TarjetaPriorizacionIA({
  priorizacion,
  prioridadActual,
  fueModificada,
}: TarjetaPriorizacionIAProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Priorización automática (IA)
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Resultado del modelo de clasificación
        </p>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {/* Prioridad sugerida vs actual */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[var(--text-muted)]">
              Sugerida por IA
            </span>
            <BadgePrioridad
              prioridad={priorizacion.nivelSugerido}
              tamano="lg"
            />
          </div>

          {fueModificada && (
            <>
              <span className="text-[var(--text-muted)]">→</span>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-[var(--text-muted)]">
                  Prioridad actual (modificada)
                </span>
                <BadgePrioridad prioridad={prioridadActual} tamano="lg" />
              </div>
            </>
          )}
        </div>

        {/* Indicador visual de confianza del modelo */}
        <IndicadorConfianza porcentaje={priorizacion.confianza} />

        {/* Justificación textual del modelo */}
        <div className="rounded-lg bg-[var(--background)] p-4">
          <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
            Justificación del modelo
          </p>
          <p className="text-sm leading-relaxed text-[var(--text-primary)]">
            {priorizacion.justificacion}
          </p>
        </div>
      </div>
    </div>
  );
}
