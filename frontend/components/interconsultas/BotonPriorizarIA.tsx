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
      exito
        ? "Priorizacion completada."
        : "No se pudo ejecutar la priorizacion.",
    );
    setEjecutando(false);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <button
        type="button"
        onClick={manejarClick}
        disabled={ejecutando || !esValida || priorizada}
        className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ejecutando
          ? "Priorizando..."
          : !esValida
            ? "Interconsulta invalida"
          : priorizada
            ? "Priorizacion IA completada"
            : "Priorizar con IA"}
      </button>

      {priorizada && esValida && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Esta interconsulta ya tiene una prioridad sugerida por el modelo.
        </p>
      )}

      {!esValida && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          No hay antecedentes clinicos suficientes para ejecutar el modelo.
        </p>
      )}

      {mensaje && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{mensaje}</p>
      )}
    </div>
  );
}
