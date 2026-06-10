"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { NivelPrioridad } from "@/types";

interface FormularioModificarPrioridadProps {
  prioridadActual: NivelPrioridad;
  onModificar: (nuevaPrioridad: NivelPrioridad, motivo: string) => Promise<boolean>;
}

const opcionesPrioridad: { valor: NivelPrioridad; etiqueta: string }[] = [
  { valor: "alta", etiqueta: "Alta - Atencion urgente" },
  { valor: "media", etiqueta: "Media - Atencion preferente" },
  { valor: "baja", etiqueta: "Baja - Atencion electiva" },
];

export default function FormularioModificarPrioridad({
  prioridadActual,
  onModificar,
}: FormularioModificarPrioridadProps) {
  const [nuevaPrioridad, setNuevaPrioridad] =
    useState<NivelPrioridad>(prioridadActual);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: "exito" | "error";
    texto: string;
  } | null>(null);

  const manejarEnvio = async (e: FormEvent) => {
    e.preventDefault();
    setMensaje(null);

    if (nuevaPrioridad === prioridadActual) {
      setMensaje({
        tipo: "error",
        texto: "Seleccione una prioridad diferente a la actual.",
      });
      return;
    }

    if (!motivo.trim()) {
      setMensaje({
        tipo: "error",
        texto: "Debe ingresar un motivo para la modificacion.",
      });
      return;
    }

    setEnviando(true);
    const exito = await onModificar(nuevaPrioridad, motivo.trim());
    setEnviando(false);

    if (exito) {
      setMensaje({
        tipo: "exito",
        texto: "Prioridad modificada exitosamente. El cambio ha sido registrado.",
      });
      setMotivo("");
      return;
    }

    setMensaje({
      tipo: "error",
      texto: "Error al modificar la prioridad. Intente nuevamente.",
    });
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Modificar prioridad
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Corrija la prioridad si el criterio clinico difiere de la sugerencia.
        </p>
      </div>

      <form onSubmit={manejarEnvio} className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="nueva-prioridad"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            Nueva prioridad
          </label>
          <select
            id="nueva-prioridad"
            value={nuevaPrioridad}
            onChange={(e) =>
              setNuevaPrioridad(e.target.value as NivelPrioridad)
            }
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
          >
            {opcionesPrioridad.map((op) => (
              <option key={op.valor} value={op.valor}>
                {op.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="motivo-modificacion"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            Motivo de la modificacion *
          </label>
          <textarea
            id="motivo-modificacion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ingrese el criterio clinico que justifica el cambio de prioridad..."
            rows={3}
            className="resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>

        {mensaje && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              mensaje.tipo === "exito"
                ? "bg-[var(--prioridad-baja-bg)] text-[var(--prioridad-baja)]"
                : "bg-[var(--prioridad-alta-bg)] text-[var(--prioridad-alta)]"
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? "Guardando..." : "Confirmar modificacion"}
        </button>
      </form>
    </div>
  );
}
