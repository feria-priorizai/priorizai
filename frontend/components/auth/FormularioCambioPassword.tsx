"use client";

/**
 * Cambio de la contraseña propia. Se usa en el primer ingreso (obligatorio) y
 * en "Mi cuenta". Las reglas son las mismas que valida el backend; aquí solo
 * se adelantan para no hacer un viaje en vano.
 */

import { useState, type FormEvent } from "react";
import { cambiarPassword } from "@/services/auth";
import type { Usuario } from "@/types/usuario";

export const PASSWORD_MINIMA = 8;
export const PASSWORD_MAXIMA = 128;

interface FormularioCambioPasswordProps {
  onCambiada: (usuario: Usuario) => void;
  textoBoton?: string;
}

export default function FormularioCambioPassword({
  onCambiada,
  textoBoton = "Cambiar contraseña",
}: FormularioCambioPasswordProps) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (nueva.length < PASSWORD_MINIMA) {
      setError(`La nueva contraseña debe tener al menos ${PASSWORD_MINIMA} caracteres.`);
      return;
    }
    if (nueva !== confirmacion) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    if (nueva === actual) {
      setError("La nueva contraseña debe ser distinta de la actual.");
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      const usuario = await cambiarPassword(actual, nueva);
      setActual("");
      setNueva("");
      setConfirmacion("");
      onCambiada(usuario);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
      setActual("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="pz-form flex flex-col gap-3" onSubmit={manejarEnvio}>
      <div>
        <label htmlFor="password-actual" className="form-label">
          Contraseña actual
        </label>
        <input
          id="password-actual"
          type="password"
          className="form-control"
          autoComplete="current-password"
          required
          maxLength={PASSWORD_MAXIMA}
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password-nueva" className="form-label">
          Nueva contraseña
        </label>
        <input
          id="password-nueva"
          type="password"
          className="form-control"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MINIMA}
          maxLength={PASSWORD_MAXIMA}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          aria-describedby="ayuda-password-nueva"
        />
        <p
          id="ayuda-password-nueva"
          className="mt-1.5 mb-0"
          style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}
        >
          Entre {PASSWORD_MINIMA} y {PASSWORD_MAXIMA} caracteres. Una frase larga es
          más segura que una palabra con símbolos.
        </p>
      </div>
      <div>
        <label htmlFor="password-confirmacion" className="form-label">
          Repetir nueva contraseña
        </label>
        <input
          id="password-confirmacion"
          type="password"
          className="form-control"
          autoComplete="new-password"
          required
          maxLength={PASSWORD_MAXIMA}
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mb-0 px-3 py-2.5"
          style={{
            fontSize: "var(--fs-sm)",
            color: "var(--pz-alta-fuerte)",
            background: "var(--pz-alta-bg)",
            borderLeft: "3px solid var(--pz-alta)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        className="pz-btn pz-btn--verde pz-btn--block mt-1"
        disabled={enviando}
      >
        {enviando ? "Guardando…" : textoBoton}
      </button>
    </form>
  );
}
