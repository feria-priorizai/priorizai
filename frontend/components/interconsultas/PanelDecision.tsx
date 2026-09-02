"use client";

import { useState } from "react";
import Link from "next/link";
import type { Interconsulta, NivelPrioridad } from "@/types";
import FormularioModificarPrioridad from "./FormularioModificarPrioridad";
import BadgeBanderaRoja from "@/components/ui/BadgeBanderaRoja";
import BadgeEstado from "@/components/ui/BadgeEstado";

type FormatoExportacion = "json" | "csv" | "xlsx";

const FORMATOS: { valor: FormatoExportacion; etiqueta: string }[] = [
  { valor: "json", etiqueta: "JSON" },
  { valor: "csv", etiqueta: "CSV" },
  { valor: "xlsx", etiqueta: "XLSX" },
];

interface PanelDecisionProps {
  interconsulta: Interconsulta;
  medicoResponsable: string;
  actualizandoEstado: boolean;
  formato: FormatoExportacion;
  onCambiarFormato: (formato: FormatoExportacion) => void;
  onExportar: () => void;
  onMarcarRevisada: () => void;
  onModificarPrioridad: (
    nuevaPrioridad: NivelPrioridad,
    motivo: string,
  ) => Promise<boolean>;
  onPriorizarConIA: () => Promise<boolean>;
}

/**
 * Columna de decisión: qué prioridad tiene la interconsulta hoy, de dónde salió
 * y cómo corregirla. Se queda fija mientras el sustento clínico scrollea al
 * lado, para que el médico nunca pierda de vista lo que debe decidir.
 */
export default function PanelDecision({
  interconsulta: ic,
  medicoResponsable,
  actualizandoEstado,
  formato,
  onCambiarFormato,
  onExportar,
  onMarcarRevisada,
  onModificarPrioridad,
  onPriorizarConIA,
}: PanelDecisionProps) {
  const [priorizando, setPriorizando] = useState(false);
  const esValida = ic.esValidaParaPriorizacion ?? true;
  const tienePrioridad = !ic.sinPrioridad;
  const priorizadaPorIA = ic.priorizacionIA.priorizada ?? true;
  const estaRevisada = ic.estado === "revisada";

  return (
    <div className="pz-panel pz-decision">
      {/* Prioridad vigente y su procedencia */}
      <div className="pz-panel__body">
        <div className="flex items-start justify-between gap-3">
          <span className="pz-eyebrow">Prioridad vigente</span>
          <BadgeEstado estado={ic.estado} />
        </div>

        {esValida && tienePrioridad ? (
          <span className={`pz-vigente pz-vigente--${ic.prioridadActual} mt-3`}>
            {ic.prioridadActual}
          </span>
        ) : (
          <span className="pz-vigente pz-vigente--ninguna mt-3">
            {esValida ? "Sin prioridad" : "No priorizable"}
          </span>
        )}

        <div className="mt-3">
          <Procedencia interconsulta={ic} />
        </div>
      </div>

      {/* Cambio manual, o priorización si todavía no tiene ninguna */}
      {esValida && (
        <div className="pz-decision__seccion">
          {tienePrioridad ? (
            <FormularioModificarPrioridad
              prioridadActual={ic.prioridadActual}
              medicoResponsable={medicoResponsable}
              onModificar={onModificarPrioridad}
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="text-[.85rem] text-[var(--pz-ink-2)]">
                La prioridad solo puede corregirse una vez que el sistema la haya
                asignado.
              </p>
              {/* La inferencia tarda: sin bloquear el botón, el segundo
                  clic dispara una segunda ejecución del modelo. */}
              <button
                type="button"
                onClick={async () => {
                  if (priorizando) return;
                  setPriorizando(true);
                  try {
                    await onPriorizarConIA();
                  } finally {
                    setPriorizando(false);
                  }
                }}
                disabled={priorizadaPorIA || priorizando}
                className="pz-btn pz-btn--morado pz-btn--block"
              >
                {priorizando ? "Priorizando…" : "Priorizar con IA"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cierre del ciclo: revisar y sacar el resultado */}
      <div className="pz-decision__seccion pz-form flex flex-col gap-2.5">
        {!estaRevisada && (
          <button
            type="button"
            onClick={onMarcarRevisada}
            disabled={actualizandoEstado}
            className="pz-btn pz-btn--verde pz-btn--block"
          >
            {actualizandoEstado ? "Actualizando…" : "Marcar como revisada"}
          </button>
        )}

        {/* HU13: solo se exporta una interconsulta ya revisada. */}
        <div className="flex gap-2">
          <select
            aria-label="Formato de exportación"
            className="form-select"
            value={formato}
            disabled={!estaRevisada}
            onChange={(e) => onCambiarFormato(e.target.value as FormatoExportacion)}
            style={{ flex: "0 0 7rem", fontSize: ".82rem" }}
          >
            {FORMATOS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.etiqueta}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onExportar}
            disabled={!estaRevisada}
            title={
              estaRevisada
                ? undefined
                : "La interconsulta debe estar revisada para poder exportar"
            }
            className="pz-btn pz-btn--azul flex-1"
          >
            Exportar
          </button>
        </div>

        <Link
          href="/interconsultas"
          className="pz-btn pz-btn--claro pz-btn--block"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Volver al listado
        </Link>
      </div>
    </div>
  );
}

/** De dónde salió la prioridad: regla clínica, modelo, o todavía nada. */
function Procedencia({ interconsulta: ic }: { interconsulta: Interconsulta }) {
  if (ic.esValidaParaPriorizacion === false) {
    return (
      <p className="text-[.82rem] leading-relaxed text-[var(--pz-ink-2)]">
        Sin antecedentes clínicos suficientes para ejecutar el modelo.
      </p>
    );
  }

  if (ic.prioridadForzadaPorRegla) {
    return (
      <div
        className="p-3"
        style={{
          background: "var(--pz-alta-bg)",
          borderLeft: "2px solid var(--pz-alta)",
        }}
      >
        <BadgeBanderaRoja terminos={ic.terminosBanderaRoja} />
        <p className="mt-2 text-[.82rem] leading-relaxed text-[var(--pz-ink)]">
          Forzada por el catálogo de términos de alarma, no por el modelo. La
          certeza no aplica.
        </p>
      </div>
    );
  }

  if (!(ic.priorizacionIA.priorizada ?? true)) {
    return (
      <p className="text-[.82rem] text-[var(--pz-ink-2)]">
        El modelo aún no ha priorizado esta interconsulta.
      </p>
    );
  }

  const fueModificada =
    ic.prioridadActual !== ic.priorizacionIA.nivelSugerido;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="pz-label">
          {fueModificada ? "Corregida por el médico" : "Sugerida por el modelo"}
        </span>
        <span className="pz-mono text-[.82rem] font-semibold text-[var(--pz-ink)]">
          {ic.priorizacionIA.confianza}%
        </span>
      </div>

      {ic.priorizacionIA.probabilidades &&
        (["alta", "media", "baja"] as const).map((nivel) => {
          const valor = ic.priorizacionIA.probabilidades?.[nivel] ?? 0;
          return (
            <div key={nivel} className="flex items-center gap-2.5">
              <span className="pz-label w-10 flex-none">{nivel}</span>
              <div className="pz-meter flex-1">
                <div
                  className={`pz-meter__fill pz-meter__fill--${nivel}`}
                  style={{ width: `${valor}%` }}
                />
              </div>
              <span className="pz-mono w-9 flex-none text-right text-[.72rem] text-[var(--pz-ink-2)]">
                {valor}%
              </span>
            </div>
          );
        })}

      {fueModificada && (
        <p className="pz-label">
          El modelo sugirió {ic.priorizacionIA.nivelSugerido}
        </p>
      )}
    </div>
  );
}
