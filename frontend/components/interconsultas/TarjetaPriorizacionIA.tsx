"use client";

import type { ResultadoPriorizacion, NivelPrioridad } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import BadgeBanderaRoja from "@/components/ui/BadgeBanderaRoja";
import IndicadorConfianza from "@/components/ui/IndicadorConfianza";

interface TarjetaPriorizacionIAProps {
  priorizacion: ResultadoPriorizacion;
  prioridadActual: NivelPrioridad;
  fueModificada: boolean;
  /** D7: cuando la prioridad viene de una regla de banderas rojas y no del
   * modelo, se reemplaza el porcentaje de confianza por esta marca. */
  prioridadForzadaPorRegla?: boolean;
  terminosBanderaRoja?: string[];
}

export default function TarjetaPriorizacionIA({
  priorizacion,
  prioridadActual,
  fueModificada,
  prioridadForzadaPorRegla = false,
  terminosBanderaRoja = [],
}: TarjetaPriorizacionIAProps) {
  const estaPriorizada = priorizacion.priorizada ?? true;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Priorizacion automatica (IA)
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Resultado del modelo de clasificacion
        </p>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {estaPriorizada ? (
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
                <span className="text-[var(--text-muted)]">-&gt;</span>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--text-muted)]">
                    Prioridad actual
                  </span>
                  <BadgePrioridad prioridad={prioridadActual} tamano="lg" />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-[var(--background)] p-4 text-sm text-[var(--text-secondary)]">
            Esta interconsulta todavia no ha sido priorizada por IA.
          </div>
        )}

        {estaPriorizada &&
          (prioridadForzadaPorRegla ? (
            <div className="rounded-lg border border-[var(--prioridad-alta-border)] bg-[var(--prioridad-alta-bg)] p-4">
              <div className="mb-2">
                <BadgeBanderaRoja terminos={terminosBanderaRoja} />
              </div>
              <p className="text-sm text-[var(--text-primary)]">
                La prioridad fue forzada a &quot;Alta&quot; por el catalogo de
                terminos de alarma, no por el modelo predictivo. El porcentaje
                de confianza no aplica en este caso.
              </p>
            </div>
          ) : (
            <IndicadorConfianza porcentaje={priorizacion.confianza} />
          ))}

        {estaPriorizada && priorizacion.probabilidades && (
          <div className="grid grid-cols-3 gap-2">
            {(["baja", "media", "alta"] as const).map((nivel) => (
              <div
                key={nivel}
                className="rounded-lg bg-[var(--background)] px-3 py-2"
              >
                <p className="text-xs capitalize text-[var(--text-muted)]">
                  {nivel}
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {priorizacion.probabilidades?.[nivel] ?? 0}%
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-[var(--background)] p-4">
          <p className="mb-1 text-xs font-medium text-[var(--text-secondary)]">
            Lectura del modelo
          </p>
          <p className="text-sm leading-relaxed text-[var(--text-primary)]">
            {priorizacion.justificacion}
          </p>
        </div>
      </div>
    </div>
  );
}
