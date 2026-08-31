"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";

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

export function ModalErroresCarga({
  children,
}: {
  children?: ReactNode;
}) {
  const { errores, limpiar } = useErroresCarga();

  if (!errores || errores.rejected_count === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="max-h-[80vh] w-[90%] max-w-[720px] overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-6 shadow-xl text-red-950">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold">
            Archivo con {errores.rejected_count} fila
            {errores.rejected_count !== 1 ? "s" : ""} incompleta
            {errores.rejected_count !== 1 ? "s" : ""}
          </h2>
          <button
            type="button"
            onClick={limpiar}
            className="rounded-md px-2 py-1 text-sm font-semibold hover:bg-red-100"
          >
            X
          </button>
        </div>

        <p className="mb-4 text-sm">
          Las filas con campos obligatorios vacíos no se guardaron. El resto
          del archivo se cargó correctamente. Las siguientes filas están incompletas:
        </p>

        <div className="flex flex-col gap-3">
          {errores.rejected.map((r) => (
            <div
              key={r.fila}
              className="rounded-lg bg-white p-4 shadow-sm"
            >
              <p className="font-semibold text-sm">
                Fila {r.fila} — faltan:{" "}
                {r.campos_faltantes.map((c) => (
                  <span key={c} className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 mr-1">
                    {c}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
