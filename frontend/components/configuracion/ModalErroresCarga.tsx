"use client";

import { useState, useEffect, useCallback } from "react";

export interface ErrorFila {
  fila: number;
  campos_faltantes: string[];
  datos_raw: Record<string, unknown>;
}

export interface ErroresCarga {
  rejected: ErrorFila[];
  rejected_count: number;
}

export const EVENTO_ERRORES_CARGA = "priorizai:errores-carga";

export function useErroresCarga() {
  const [errores, setErrores] = useState<ErroresCarga | null>(null);

  const limpiar = useCallback(() => setErrores(null), []);

  useEffect(() => {
    const handler = (e: Event) => {
      const data = (e as CustomEvent<ErroresCarga>).detail;
      if (data) {
        setErrores(data);
      }
    };
    window.addEventListener(EVENTO_ERRORES_CARGA, handler);
    return () => window.removeEventListener(EVENTO_ERRORES_CARGA, handler);
  }, []);

  return { errores, limpiar };
}

export function ModalErroresCarga() {
  const { errores, limpiar } = useErroresCarga();

  if (!errores || errores.rejected_count === 0) return null;

  const plural = errores.rejected_count !== 1;

  return (
    <div
      className="pz-modal-fondo"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-errores-carga"
    >
      <div className="pz-modal">
        <div className="pz-panel__head flex items-start justify-between gap-4">
          <div>
            <span className="pz-eyebrow pz-eyebrow--alta">Carga incompleta</span>
            <h2 id="titulo-errores-carga" className="pz-panel__title">
              {errores.rejected_count} fila{plural ? "s" : ""} no se guard
              {plural ? "aron" : "ó"}
            </h2>
            <p className="pz-panel__sub">
              El resto del archivo se cargó correctamente. Estas filas venían sin
              algún campo obligatorio.
            </p>
          </div>

          <button
            type="button"
            onClick={limpiar}
            aria-label="Cerrar"
            className="pz-mono flex-none px-2 py-1 text-[.8rem] text-[var(--pz-ink-3)] hover:text-[var(--pz-ink)]"
          >
            ✕
          </button>
        </div>

        <div className="pz-panel__body flex flex-col gap-2">
          {errores.rejected.map((r) => (
            <div
              key={r.fila}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5"
              style={{
                background: "var(--pz-paper-2)",
                borderLeft: "2px solid var(--pz-alta)",
              }}
            >
              <span className="pz-mono text-[.72rem] font-semibold text-[var(--pz-ink)]">
                Fila {r.fila}
              </span>
              <span className="pz-label">faltan</span>
              {r.campos_faltantes.map((c) => (
                <span key={c} className="pz-chip pz-chip--alta">
                  {c}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div className="pz-panel__body pt-0">
          <button
            type="button"
            onClick={limpiar}
            className="pz-btn pz-btn--solid pz-btn--block"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
