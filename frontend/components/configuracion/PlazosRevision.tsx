"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { NivelPrioridad, PlazosRevision as Plazos } from "@/types";
import { EVENTO_INTERCONSULTAS_ACTUALIZADAS } from "@/services/interconsultas";
import { guardarPlazosRevision, obtenerPlazosRevision } from "@/services/plazos";
import {
  errorDePlazo,
  NIVELES_PLAZO,
  PLAZO_MAXIMO,
  validarPlazos,
} from "@/utils/plazos";

type Valores = Record<NivelPrioridad, string>;

const comoTexto = (plazos: Plazos): Valores => ({
  alta: String(plazos.alta),
  media: String(plazos.media),
  baja: String(plazos.baja),
});

/**
 * Plazos máximos de revisión por prioridad (HDU-22). Una interconsulta
 * pendiente que lleva más días que el plazo de su prioridad queda atrasada.
 * La página de configuración ya es solo para administradores, y el backend
 * rechaza el cambio de cualquier otro rol aunque llame a la API directo.
 */
export default function PlazosRevision() {
  const [valores, setValores] = useState<Valores | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Un campo vacío recién se marca al intentar guardar: mientras se borra para
  // escribir otro número no corresponde regañar.
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: "exito" | "error";
    texto: string;
    nivel?: NivelPrioridad;
  } | null>(null);

  useEffect(() => {
    let activo = true;
    obtenerPlazosRevision()
      .then((plazos) => {
        if (activo) setValores(comoTexto(plazos));
      })
      .catch((error: unknown) => {
        if (activo) {
          setErrorCarga(
            error instanceof Error ? error.message : "No se pudieron cargar los plazos",
          );
        }
      });
    return () => {
      activo = false;
    };
  }, []);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!valores) return;
    setIntentoGuardar(true);
    const validacion = validarPlazos(valores);
    if (!validacion.ok) {
      // El error de un campo ya se ve debajo de él; el aviso general queda
      // para el orden entre prioridades, que no es de un solo campo.
      const deUnCampo = errorDePlazo(valores[validacion.nivel]) !== null;
      setMensaje(
        deUnCampo
          ? null
          : { tipo: "error", texto: validacion.error, nivel: validacion.nivel },
      );
      document.getElementById(`plazo-${validacion.nivel}`)?.focus();
      return;
    }

    setGuardando(true);
    setMensaje(null);
    try {
      const guardados = await guardarPlazosRevision(validacion.plazos);
      setValores(comoTexto(guardados));
      setMensaje({
        tipo: "exito",
        texto: "Plazos guardados. Ya rigen para todas las interconsultas pendientes.",
      });
      // El atraso se calcula al leer: la lista que esté abierta se recarga
      // para mostrar las atrasadas con el plazo nuevo.
      window.dispatchEvent(
        new CustomEvent(EVENTO_INTERCONSULTAS_ACTUALIZADAS, { detail: null }),
      );
    } catch (error) {
      setMensaje({
        tipo: "error",
        texto:
          error instanceof Error ? error.message : "No se pudieron guardar los plazos",
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="pz-panel" aria-labelledby="titulo-plazos">
      <div className="pz-panel__head">
        <span className="pz-eyebrow">Revisión</span>
        <h2 id="titulo-plazos" className="pz-panel__title">
          Plazos de revisión
        </h2>
        <p className="pz-panel__sub">
          Días máximos desde la emisión para revisar una interconsulta de cada
          prioridad. Las pendientes que los superen quedan marcadas como
          atrasadas.
        </p>
      </div>

      <div className="pz-panel__body">
        {errorCarga ? (
          <p role="alert" className="text-[.85rem] text-[var(--pz-alta)]">
            {errorCarga}
          </p>
        ) : !valores ? (
          <p className="pz-label">Cargando plazos…</p>
        ) : (
          <form onSubmit={guardar} noValidate className="pz-form flex flex-col gap-4">
            <div className="pz-plazos">
              {NIVELES_PLAZO.map((nivel) => {
                const valor = valores[nivel];
                const error =
                  valor.trim() || intentoGuardar ? errorDePlazo(valor) : null;
                return (
                <div key={nivel} className={`pz-plazo pz-plazo--${nivel}`}>
                  <label htmlFor={`plazo-${nivel}`} className="pz-plazo__nombre">
                    <span className="visually-hidden">Plazo de prioridad </span>
                    <span className={`pz-chip pz-chip--${nivel}`}>{nivel}</span>
                  </label>
                  <div className="pz-plazo__campo">
                    <input
                      id={`plazo-${nivel}`}
                      data-testid={`plazo-${nivel}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={PLAZO_MAXIMO}
                      step={1}
                      className="form-control"
                      value={valores[nivel]}
                      disabled={guardando}
                      aria-invalid={error !== null || mensaje?.nivel === nivel}
                      aria-describedby={error ? `plazo-${nivel}-error` : undefined}
                      onChange={(e) => {
                        setValores({ ...valores, [nivel]: e.target.value });
                        if (mensaje?.tipo === "exito") setMensaje(null);
                      }}
                    />
                    <span className="pz-plazo__unidad" aria-hidden="true">
                      días
                    </span>
                  </div>
                  {error && (
                    <p
                      id={`plazo-${nivel}-error`}
                      className="pz-plazo__error"
                      data-testid={`plazo-${nivel}-error`}
                    >
                      {error}
                    </p>
                  )}
                </div>
                );
              })}
            </div>

            {mensaje && (
              <div
                role={mensaje.tipo === "error" ? "alert" : "status"}
                data-testid="mensaje-plazos"
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

            <div>
              <button
                type="submit"
                data-testid="guardar-plazos"
                disabled={guardando}
                className="pz-btn pz-btn--verde"
              >
                {guardando ? "Guardando…" : "Guardar plazos"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
