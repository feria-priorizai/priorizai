"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { EVENTO_ERRORES_CARGA } from "@/services/interconsultas";

export interface ErrorFila {
  fila: number;
  campos_faltantes: string[];
  datos_raw: Record<string, unknown>;
}

export interface ErroresCarga {
  rejected: ErrorFila[];
  rejected_count: number;
}

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
  const dialogoRef = useRef<HTMLDivElement | null>(null);
  const cerrarRef = useRef<HTMLButtonElement | null>(null);
  // Para devolver el foco a donde estaba (el boton "Cargar archivo" del
  // sidebar) cuando el modal se cierra.
  const focoPrevioRef = useRef<HTMLElement | null>(null);

  const abierto = Boolean(errores) && (errores?.rejected_count ?? 0) > 0;

  useEffect(() => {
    if (!abierto) {
      return;
    }

    focoPrevioRef.current = document.activeElement as HTMLElement | null;
    cerrarRef.current?.focus();

    // Un dialogo modal tiene que atrapar el foco: sin esto el tabulador se va a
    // la pagina de atras, que el lector de pantalla no deberia poder alcanzar.
    const manejarTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        limpiar();
        return;
      }

      if (e.key !== "Tab" || !dialogoRef.current) {
        return;
      }

      const focusables = dialogoRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        return;
      }

      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", manejarTeclado);
    return () => {
      document.removeEventListener("keydown", manejarTeclado);
      focoPrevioRef.current?.focus();
    };
  }, [abierto, limpiar]);

  if (!errores || errores.rejected_count === 0) return null;

  const plural = errores.rejected_count !== 1;

  return (
    <div
      className="pz-modal-fondo"
      // Clic fuera del panel: misma salida que Escape.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) limpiar();
      }}
    >
      <div
        ref={dialogoRef}
        className="pz-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-errores-carga"
      >
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
            ref={cerrarRef}
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
