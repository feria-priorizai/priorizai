"use client";

import { useState } from "react";

interface BotonPriorizarIAProps {
  priorizada: boolean;
  onPriorizar: () => Promise<boolean>;
}

export default function BotonPriorizarIA({
  priorizada,
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
        disabled={ejecutando}
        className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ejecutando
          ? "Priorizando..."
          : priorizada
            ? "Repriorizar con IA"
            : "Priorizar con IA"}
      </button>

      {mensaje && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{mensaje}</p>
      )}
    </div>
  );
}
