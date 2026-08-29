"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { NivelPrioridad } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";

interface FormularioModificarPrioridadProps {
  prioridadActual: NivelPrioridad;
  medicoResponsable: string;
  onModificar: (nuevaPrioridad: NivelPrioridad, motivo: string) => Promise<boolean>;
}

const opcionesPrioridad: { valor: NivelPrioridad; etiqueta: string }[] = [
  { valor: "alta", etiqueta: "Alta - Atencion urgente" },
  { valor: "media", etiqueta: "Media - Atencion preferente" },
  { valor: "baja", etiqueta: "Baja - Atencion electiva" },
];

const MOTIVO_MINIMO = 10;

export default function FormularioModificarPrioridad({
  prioridadActual,
  medicoResponsable,
  onModificar,
}: FormularioModificarPrioridadProps) {
  const [nuevaPrioridad, setNuevaPrioridad] =
    useState<NivelPrioridad>(prioridadActual);
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: "exito" | "error";
    texto: string;
  } | null>(null);

  // Si la prioridad vigente cambia (otra accion la actualizo), se reinicia la
  // seleccion durante el render en vez de usar un efecto.
  const [prioridadSincronizada, setPrioridadSincronizada] =
    useState<NivelPrioridad>(prioridadActual);
  if (prioridadSincronizada !== prioridadActual) {
    setPrioridadSincronizada(prioridadActual);
    setNuevaPrioridad(prioridadActual);
    setConfirmando(false);
  }

  const motivoLimpio = motivo.trim();
  const motivoInvalido = mensaje?.tipo === "error" && motivoLimpio.length < MOTIVO_MINIMO;

  const manejarEnvio = (e: FormEvent) => {
    e.preventDefault();
    setMensaje(null);

    if (nuevaPrioridad === prioridadActual) {
      setMensaje({
        tipo: "error",
        texto: "Seleccione una prioridad diferente a la actual.",
      });
      return;
    }

    if (!motivoLimpio) {
      setMensaje({
        tipo: "error",
        texto:
          "Debe ingresar un motivo para la modificacion. El cambio no fue guardado.",
      });
      return;
    }

    if (motivoLimpio.length < MOTIVO_MINIMO) {
      setMensaje({
        tipo: "error",
        texto: `El motivo debe tener al menos ${MOTIVO_MINIMO} caracteres para justificar el cambio. El cambio no fue guardado.`,
      });
      return;
    }

    setConfirmando(true);
  };

  const confirmarModificacion = async () => {
    setEnviando(true);
    const exito = await onModificar(nuevaPrioridad, motivoLimpio);
    setEnviando(false);
    setConfirmando(false);

    if (exito) {
      setMensaje({
        tipo: "exito",
        texto:
          "Prioridad modificada exitosamente. El cambio quedo registrado en el historial.",
      });
      setMotivo("");
      return;
    }

    setMensaje({
      tipo: "error",
      texto:
        "Error al modificar la prioridad. El cambio no fue guardado.",
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
            disabled={confirmando || enviando}
            onChange={(e) =>
              setNuevaPrioridad(e.target.value as NivelPrioridad)
            }
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-60"
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
            disabled={confirmando || enviando}
            aria-invalid={motivoInvalido}
            aria-describedby="motivo-ayuda"
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ingrese el criterio clinico que justifica el cambio de prioridad..."
            rows={3}
            className="resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-60 aria-[invalid=true]:border-[var(--prioridad-alta)]"
          />
          <p
            id="motivo-ayuda"
            className="text-xs text-[var(--text-muted)]"
          >
            Obligatorio, minimo {MOTIVO_MINIMO} caracteres ({motivoLimpio.length}/
            {MOTIVO_MINIMO}).
          </p>
        </div>

        <div className="rounded-lg bg-[var(--background)] px-4 py-3">
          <span className="text-xs text-[var(--text-muted)]">
            Responsable del cambio
          </span>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {medicoResponsable}
          </p>
        </div>

        {mensaje && (
          <div
            role={mensaje.tipo === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`rounded-lg px-4 py-3 text-sm ${
              mensaje.tipo === "exito"
                ? "bg-[var(--prioridad-baja-bg)] text-[var(--prioridad-baja)]"
                : "bg-[var(--prioridad-alta-bg)] text-[var(--prioridad-alta)]"
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        {confirmando ? (
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--prioridad-alta-border)] bg-[var(--prioridad-alta-bg)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Confirme el cambio de prioridad
            </p>
            <div className="flex items-center gap-2">
              <BadgePrioridad prioridad={prioridadActual} />
              <span className="text-[var(--text-muted)]">{"->"}</span>
              <BadgePrioridad prioridad={nuevaPrioridad} />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Quedara registrado en el historial a nombre de {medicoResponsable}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmarModificacion}
                disabled={enviando}
                className="flex-1 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando ? "Guardando..." : "Confirmar cambio"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={enviando}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
          >
            Modificar prioridad
          </button>
        )}
      </form>
    </div>
  );
}
