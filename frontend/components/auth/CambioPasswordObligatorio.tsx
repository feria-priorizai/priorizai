"use client";

/**
 * Primer ingreso: la contraseña inicial la definió otra persona (el admin, o el
 * .env para el admin inicial), así que hay que cambiarla antes de usar la app.
 * Mismo fondo que el login: todavía no se entra a la aplicación.
 */

import Image from "next/image";
import FormularioCambioPassword from "@/components/auth/FormularioCambioPassword";
import type { Usuario } from "@/types/usuario";

interface CambioPasswordObligatorioProps {
  usuario: Usuario;
  onCambiada: (usuario: Usuario) => void;
  onCerrarSesion: () => Promise<void>;
}

export default function CambioPasswordObligatorio({
  usuario,
  onCambiada,
  onCerrarSesion,
}: CambioPasswordObligatorioProps) {
  return (
    <main className="pz-login flex min-h-screen items-center justify-center p-6">
      <div className="w-full" style={{ maxWidth: "29rem" }}>
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

        <section className="pz-panel" aria-labelledby="titulo-cambio">
          <div className="pz-panel__head">
            <span className="pz-eyebrow pz-eyebrow--green">Primer ingreso</span>
            <h1 id="titulo-cambio" className="pz-panel__title">
              Crea tu contraseña
            </h1>
            <p className="pz-panel__sub">
              Hola, {usuario.nombre}. La contraseña con la que entraste la definió
              otra persona; elige una que solo conozcas tú para continuar.
            </p>
          </div>
          <div className="pz-panel__body">
            <FormularioCambioPassword
              onCambiada={onCambiada}
              textoBoton="Guardar y continuar"
            />
            <button
              type="button"
              onClick={() => void onCerrarSesion()}
              className="pz-btn pz-btn--claro pz-btn--block mt-3"
            >
              Cerrar sesión
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
