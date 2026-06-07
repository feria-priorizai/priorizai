"use client";

/**
 * Formulario para modificar manualmente la prioridad de una interconsulta (HdU02).
 *
 * Criterios de aceptación HdU02:
 * - El médico puede modificar manualmente la prioridad.
 * - Al confirmar, el sistema actualiza y confirma la recepción.
 * - Si la prioridad es incorrecta, permite corregirla para redirigir al SISLE.
 */

import { useState } from "react";
import type { NivelPrioridad } from "@/types";

interface FormularioModificarPrioridadProps {
  prioridadActual: NivelPrioridad;
  /** Callback al confirmar la modificación */
  onModificar: (nuevaPrioridad: NivelPrioridad, motivo: string) => Promise<boolean>;
}

/** Opciones de prioridad disponibles con etiqueta descriptiva */
const opcionesPrioridad: { valor: NivelPrioridad; etiqueta: string }[] = [
  { valor: "alta", etiqueta: "Alta - Atención urgente" },
  { valor: "media", etiqueta: "Media - Atención preferente" },
  { valor: "baja", etiqueta: "Baja - Atención electiva" },
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

  /** Valida y envía la modificación de prioridad */
  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje(null);

    /* Validación: no enviar si no cambió la prioridad */
    if (nuevaPrioridad === prioridadActual) {
      setMensaje({
        tipo: "error",
        texto: "Seleccione una prioridad diferente a la actual.",
      });
      return;
    }

    /* Validación: motivo obligatorio */
    if (!motivo.trim()) {
      setMensaje({
        tipo: "error",
        texto: "Debe ingresar un motivo para la modificación.",
      });
      return;
    }

    setEnviando(true);
    const exito = await onModificar(nuevaPrioridad, motivo.trim());

    if (exito) {
      setMensaje({
        tipo: "exito",
        texto: "Prioridad modificada exitosamente. El cambio ha sido registrado.",
      });
      setMotivo("");
    } else {
      setMensaje({
        tipo: "error",
        texto: "Error al modificar la prioridad. Intente nuevamente.",
      });
    }
    setEnviando(false);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Modificar prioridad
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Corrija la prioridad si el criterio clínico difiere de la sugerencia
        </p>
      </div>

      <form onSubmit={manejarEnvio} className="flex flex-col gap-4 p-5">
        {/* Selector de nueva prioridad */}
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

        {/* Motivo de la modificación */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="motivo-modificacion"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            Motivo de la modificación *
          </label>
          <textarea
            id="motivo-modificacion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ingrese el criterio clínico que justifica el cambio de prioridad..."
            rows={3}
            className="resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>

        {/* Mensaje de confirmación o error */}
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

        {/* Botón de envío */}
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {enviando ? "Guardando..." : "Confirmar modificación"}
        </button>
      </form>
    </div>
  );
}
