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

const nivelesProbabilidad = ["alta", "media", "baja"] as const;

export default function TarjetaPriorizacionIA({
  priorizacion,
  prioridadActual,
  fueModificada,
  prioridadForzadaPorRegla = false,
  terminosBanderaRoja = [],
}: TarjetaPriorizacionIAProps) {
  const estaPriorizada = priorizacion.priorizada ?? true;

  return (
    <div className="pz-panel pz-crop">
      <div className="pz-panel__head">
        <span className="pz-eyebrow pz-eyebrow--purple">Modelo predictivo</span>
        <h3 className="pz-panel__title">Priorización automática</h3>
      </div>

      <div className="pz-panel__body flex flex-col gap-5">
        {estaPriorizada ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="pz-label">Sugerida por IA</span>
              <BadgePrioridad
                prioridad={priorizacion.nivelSugerido}
                tamano="lg"
              />
            </div>

            {fueModificada && (
              <>
                <span
                  className="pz-mono pb-1 text-[var(--pz-ink-3)]"
                  aria-hidden="true"
                >
                  →
                </span>
                <div className="flex flex-col gap-1.5">
                  <span className="pz-label">Prioridad vigente</span>
                  <BadgePrioridad prioridad={prioridadActual} tamano="lg" />
                </div>
              </>
            )}
          </div>
        ) : (
          <p
            className="p-3 text-[.88rem] text-[var(--pz-ink-2)]"
            style={{ background: "var(--pz-paper-2)" }}
          >
            Esta interconsulta todavía no ha sido priorizada por IA.
          </p>
        )}

        {/* La regla clinica manda aunque el modelo nunca haya corrido: si se
            anida bajo estaPriorizada, la explicacion de por que la prioridad es
            "Alta" desaparece justo en las interconsultas con bandera roja. */}
        {prioridadForzadaPorRegla ? (
            <div
              className="p-3.5"
              style={{
                background: "var(--pz-alta-bg)",
                borderLeft: "2px solid var(--pz-alta)",
              }}
            >
              <BadgeBanderaRoja terminos={terminosBanderaRoja} />
              <p className="mt-2.5 text-[.88rem] leading-relaxed text-[var(--pz-ink)]">
                La prioridad fue forzada a &quot;Alta&quot; por el catálogo de
                términos de alarma, no por el modelo predictivo. El porcentaje
                de certeza no aplica en este caso.
              </p>
            </div>
          ) : estaPriorizada ? (
            <IndicadorConfianza porcentaje={priorizacion.confianza} />
          ) : null}

        {estaPriorizada && priorizacion.probabilidades && (
          <div className="flex flex-col gap-2.5">
            <span className="pz-label">Distribución de probabilidad</span>
            {nivelesProbabilidad.map((nivel) => {
              const valor = priorizacion.probabilidades?.[nivel] ?? 0;
              return (
                <div key={nivel} className="flex items-center gap-3">
                  <span className="pz-label w-12 flex-none">{nivel}</span>
                  <div className="pz-meter flex-1">
                    <div
                      className={`pz-meter__fill pz-meter__fill--${nivel}`}
                      style={{ width: `${valor}%` }}
                    />
                  </div>
                  <span className="pz-mono w-10 flex-none text-right text-[.76rem] font-semibold text-[var(--pz-ink)]">
                    {valor}%
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--pz-line)" }} className="pt-3.5">
          <span className="pz-label">Lectura del modelo</span>
          <p className="mt-1.5 text-[.88rem] leading-relaxed text-[var(--pz-ink-2)]">
            {priorizacion.justificacion}
          </p>
        </div>
      </div>
    </div>
  );
}
