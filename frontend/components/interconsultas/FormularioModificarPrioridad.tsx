"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { NivelPrioridad } from "@/types";

interface FormularioModificarPrioridadProps {
  prioridadActual: NivelPrioridad;
  medicoResponsable: string;
  onModificar: (nuevaPrioridad: NivelPrioridad, motivo: string) => Promise<boolean>;
}

const NIVELES: NivelPrioridad[] = ["alta", "media", "baja"];
const MOTIVO_MINIMO = 10;

/**
 * Cambio manual de prioridad (HdU02). Vive dentro de la columna de decisión,
 * así que no dibuja su propio marco.
 */
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
  const hayCambio = nuevaPrioridad !== prioridadActual;
  const motivoInvalido =
    mensaje?.tipo === "error" && motivoLimpio.length < MOTIVO_MINIMO;

  const manejarEnvio = (e: FormEvent) => {
    e.preventDefault();
    setMensaje(null);

    if (!hayCambio) {
      setMensaje({
        tipo: "error",
        texto: "Seleccione una prioridad diferente a la vigente.",
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
        texto: `El motivo debe tener al menos ${MOTIVO_MINIMO} caracteres. El cambio no fue guardado.`,
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
        texto: "Prioridad modificada. Quedó registrada en el historial.",
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
    <form onSubmit={manejarEnvio} className="pz-form flex flex-col gap-3">
      <div>
        <span className="pz-label mb-1.5">Cambiar a</span>
        <div className="pz-seg" role="group" aria-label="Nueva prioridad">
          {NIVELES.map((nivel) => (
            <button
              key={nivel}
              type="button"
              data-nivel={nivel}
              aria-pressed={nuevaPrioridad === nivel}
              disabled={confirmando || enviando}
              onClick={() => setNuevaPrioridad(nivel)}
              className={`pz-seg__op ${nuevaPrioridad === nivel ? "is-on" : ""}`}
            >
              {nivel}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="motivo-modificacion" className="form-label">
          Motivo *
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
          Obligatorio · mínimo {MOTIVO_MINIMO} ({motivoLimpio.length}/
          {MOTIVO_MINIMO})
        </p>
      </div>

      {mensaje && (
        <div
          role={mensaje.tipo === "error" ? "alert" : "status"}
          aria-live="polite"
          className="px-3 py-2.5 text-[.82rem]"
          style={{
            background:
              mensaje.tipo === "exito" ? "var(--pz-baja-bg)" : "var(--pz-alta-bg)",
            borderLeft: `2px solid ${
              mensaje.tipo === "exito" ? "var(--pz-green)" : "var(--pz-alta)"
            }`,
            color:
              mensaje.tipo === "exito" ? "var(--pz-green-ink)" : "var(--pz-alta)",
          }}
        >
          {mensaje.texto}
        </div>
      )}

      {confirmando ? (
        <div
          className="flex flex-col gap-2.5 p-3"
          style={{
            background: "var(--pz-paper-2)",
            border: "1px solid var(--pz-line-2)",
          }}
        >
          <span className="pz-eyebrow pz-eyebrow--alta">Confirme el cambio</span>
          <p className="text-[.82rem] text-[var(--pz-ink-2)]">
            <strong className="text-[var(--pz-ink)] uppercase">
              {prioridadActual}
            </strong>{" "}
            →{" "}
            <strong className="text-[var(--pz-ink)] uppercase">
              {nuevaPrioridad}
            </strong>
            , a nombre de {medicoResponsable}.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmarModificacion}
              disabled={enviando}
              className="pz-btn pz-btn--verde flex-1"
            >
              {enviando ? "Guardando…" : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
              className="pz-btn pz-btn--claro"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="submit"
          disabled={!hayCambio}
          className="pz-btn pz-btn--verde pz-btn--block"
        >
          Confirmar cambio
        </button>
      )}
    </form>
  );
}
