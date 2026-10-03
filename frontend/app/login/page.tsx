"use client";

/**
 * Inicio de sesión (HDU-15): alias y contraseña. Fuera del AppShell, sin
 * barra lateral: hasta que haya sesión no hay nada que navegar.
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { iniciarSesion } from "@/services/auth";

/** Solo rutas internas: un ?next=https://otro-sitio convertiría el login en
 *  un redirector abierto, útil para phishing. Se compara el origen ya resuelto
 *  y no el texto, porque el navegador normaliza cosas como `/\evil.com` o un
 *  tabulador en `/\t/evil.com` hasta convertirlas en otro dominio. */
function destinoSeguro(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return "/dashboard";
  let destino: URL;
  try {
    destino = new URL(next, window.location.origin);
  } catch {
    return "/dashboard";
  }
  if (destino.origin !== window.location.origin || destino.pathname === "/login") {
    return "/dashboard";
  }
  return destino.pathname + destino.search + destino.hash;
}

export default function LoginPage() {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    try {
      await iniciarSesion(alias, password);
      router.replace(destinoSeguro());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
      setPassword("");
      setEnviando(false);
    }
  };

  return (
    <main className="pz-login flex min-h-screen items-center justify-center p-6">
      <div className="w-full" style={{ maxWidth: "27rem" }}>
        <div className="mb-6 flex justify-center">
          <Image
            src="/img/logo-priorizai-white.png"
            alt="PriorizAI"
            width={200}
            height={40}
            priority
            className="h-[34px] w-auto"
          />
        </div>

        <section className="pz-panel" aria-labelledby="titulo-login">
          <div className="pz-panel__head">
            <span className="pz-eyebrow">Acceso</span>
            <h1 id="titulo-login" className="pz-panel__title">
              Inicia sesión
            </h1>
            <p className="pz-panel__sub">
              Usa el alias y la contraseña que te entregó el administrador.
            </p>
          </div>

          <form className="pz-form pz-panel__body flex flex-col gap-4" onSubmit={manejarEnvio}>
            <div>
              <label htmlFor="alias" className="form-label">
                Alias
              </label>
              <input
                id="alias"
                name="username"
                className="form-control"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
                maxLength={64}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </div>

            <div>
              <label htmlFor="password" className="form-label">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className="form-control"
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
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
              className="pz-btn pz-btn--verde pz-btn--block pz-btn--lg mt-1"
              disabled={enviando}
            >
              {enviando ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
