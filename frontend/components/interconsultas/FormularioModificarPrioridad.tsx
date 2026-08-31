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
  { valor: "alta", etiqueta: "Alta — atención urgente" },
  { valor: "media", etiqueta: "Media — atención preferente" },
  { valor: "baja", etiqueta: "Baja — atención electiva" },
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
  const motivoInvalido =
    mensaje?.tipo === "error" && motivoLimpio.length < MOTIVO_MINIMO;

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
          "Debe ingresar un motivo para la modificación. El cambio no fue guardado.",
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
          "Prioridad modificada. El cambio quedó registrado en el historial.",
      });
      setMotivo("");
      return;
    }

    setMensaje({
      tipo: "error",
      texto: "Error al modificar la prioridad. El cambio no fue guardado.",
    });
  };

  return (
    <div className="pz-panel pz-form">
      <div className="pz-panel__head">
        <span className="pz-eyebrow pz-eyebrow--green">Control clínico</span>
        <h3 className="pz-panel__title">Modificar prioridad</h3>
        <p className="pz-panel__sub">
          Corrija la prioridad si el criterio clínico difiere de la sugerencia.
        </p>
      </div>

      <form onSubmit={manejarEnvio} className="pz-panel__body flex flex-col gap-4">
        <div>
          <label htmlFor="nueva-prioridad" className="form-label">
            Nueva prioridad
          </label>
          <select
            id="nueva-prioridad"
            className="form-select"
            value={nuevaPrioridad}
            disabled={confirmando || enviando}
            onChange={(e) => setNuevaPrioridad(e.target.value as NivelPrioridad)}
          >
            {opcionesPrioridad.map((op) => (
              <option key={op.valor} value={op.valor}>
                {op.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="motivo-modificacion" className="form-label">
            Motivo de la modificación *
          </label>
          <textarea
            id="motivo-modificacion"
            className="form-control"
            value={motivo}
            disabled={confirmando || enviando}
            aria-invalid={motivoInvalido}
            aria-describedby="motivo-ayuda"
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Criterio clínico que justifica el cambio…"
            rows={3}
            style={{ resize: "none" }}
          />
          <p id="motivo-ayuda" className="pz-label mt-1.5">
            Obligatorio · mínimo {MOTIVO_MINIMO} caracteres ({motivoLimpio.length}/
            {MOTIVO_MINIMO})
          </p>
        </div>

        <div
          className="px-3 py-2.5"
          style={{ background: "var(--pz-paper-2)" }}
        >
          <span className="pz-label">Responsable del cambio</span>
          <p className="mt-0.5 text-[.88rem] font-semibold text-[var(--pz-ink)]">
            {medicoResponsable}
          </p>
        </div>

        {mensaje && (
          <div
            role={mensaje.tipo === "error" ? "alert" : "status"}
            aria-live="polite"
            className="px-3 py-2.5 text-[.85rem]"
            style={{
              background:
                mensaje.tipo === "exito"
                  ? "var(--pz-baja-bg)"
                  : "var(--pz-alta-bg)",
              borderLeft: `2px solid ${
                mensaje.tipo === "exito" ? "var(--pz-green)" : "var(--pz-alta)"
              }`,
              color:
                mensaje.tipo === "exito"
                  ? "var(--pz-green-ink)"
                  : "var(--pz-alta)",
            }}
          >
            {mensaje.texto}
          </div>
        )}

        {confirmando ? (
          <div
            className="flex flex-col gap-3 p-3.5"
            style={{
              background: "var(--pz-paper-2)",
              border: "1px solid var(--pz-line-2)",
            }}
          >
            <span className="pz-eyebrow pz-eyebrow--alta">
              Confirme el cambio
            </span>
            <div className="flex items-center gap-2">
              <BadgePrioridad prioridad={prioridadActual} />
              <span className="pz-mono text-[var(--pz-ink-3)]" aria-hidden="true">
                →
              </span>
              <BadgePrioridad prioridad={nuevaPrioridad} />
            </div>
            <p className="text-[.85rem] text-[var(--pz-ink-2)]">
              Quedará registrado en el historial a nombre de {medicoResponsable}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmarModificacion}
                disabled={enviando}
                className="pz-btn pz-btn--solid flex-1"
              >
                {enviando ? "Guardando…" : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={enviando}
                className="pz-btn pz-btn--ghost"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="submit" className="pz-btn pz-btn--solid pz-btn--block">
            Modificar prioridad
          </button>
        )}
      </form>
    </div>
  );
}
