"use client";

import { useState } from "react";

interface BotonPriorizarIAProps {
  priorizada: boolean;
  esValida: boolean;
  onPriorizar: () => Promise<boolean>;
}

export default function BotonPriorizarIA({
  priorizada,
  esValida,
  onPriorizar,
}: BotonPriorizarIAProps) {
  const [ejecutando, setEjecutando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const manejarClick = async () => {
    setEjecutando(true);
    setMensaje(null);
    const exito = await onPriorizar();
    setMensaje(
      exito ? "Priorización completada." : "No se pudo ejecutar la priorización.",
    );
    setEjecutando(false);
  };

  return (
    <div className="pz-panel">
      <div className="pz-panel__head">
        <span className="pz-eyebrow pz-eyebrow--purple">Modelo predictivo</span>
        <h3 className="pz-panel__title">Sin priorizar</h3>
        <p className="pz-panel__sub">
          La prioridad solo puede modificarse una vez que el sistema la haya
          priorizado.
        </p>
      </div>

      <div className="pz-panel__body">
        <button
          type="button"
          onClick={manejarClick}
          disabled={ejecutando || !esValida || priorizada}
          className="pz-btn pz-btn--solid pz-btn--block"
        >
          {ejecutando
            ? "Priorizando…"
            : !esValida
              ? "Interconsulta inválida"
              : priorizada
                ? "Priorización completada"
                : "Priorizar con IA"}
        </button>

        {!esValida && (
          <p className="mt-3 text-[.85rem] text-[var(--pz-ink-2)]">
            No hay antecedentes clínicos suficientes para ejecutar el modelo.
          </p>
        )}

        {mensaje && (
          <p
            role="status"
            aria-live="polite"
            className="mt-3 text-[.85rem] text-[var(--pz-ink-2)]"
          >
            {mensaje}
          </p>
        )}
      </div>
    </div>
  );
}
