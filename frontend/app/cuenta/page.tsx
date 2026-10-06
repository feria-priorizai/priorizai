"use client";

/**
 * Mi cuenta: datos de la sesión y cambio de la contraseña propia.
 */

import { useState } from "react";
import { useSesion } from "@/context/SesionContext";
import FormularioCambioPassword from "@/components/auth/FormularioCambioPassword";
import { ETIQUETAS_ROL } from "@/types/usuario";

export default function CuentaPage() {
  const { usuario } = useSesion();
  const [cambiada, setCambiada] = useState(false);

  return (
    <div className="row g-4">
      <div className="col-12 col-lg-5">
        <section className="pz-panel" aria-labelledby="titulo-datos">
          <div className="pz-panel__head">
            <span className="pz-eyebrow">Sesión</span>
            <h2 id="titulo-datos" className="pz-panel__title">
              {usuario.nombre}
            </h2>
          </div>
          <dl className="pz-panel__body mb-0 flex flex-col gap-3">
            <div>
              <dt className="pz-label">Alias</dt>
              <dd className="pz-mono mb-0 mt-1">{usuario.alias}</dd>
            </div>
            {usuario.correo && (
              <div>
                <dt className="pz-label">Correo</dt>
                <dd className="mb-0 mt-1">{usuario.correo}</dd>
              </div>
            )}
            <div>
              <dt className="pz-label">Rol</dt>
              <dd className="mb-0 mt-1">{ETIQUETAS_ROL[usuario.rol] ?? usuario.rol}</dd>
            </div>
            {usuario.especialidad && (
              <div>
                <dt className="pz-label">Especialidad</dt>
                <dd className="mb-0 mt-1">{usuario.especialidad}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <div className="col-12 col-lg-7">
        <section className="pz-panel" aria-labelledby="titulo-password">
          <div className="pz-panel__head">
            <span className="pz-eyebrow pz-eyebrow--green">Seguridad</span>
            <h2 id="titulo-password" className="pz-panel__title">
              Cambiar contraseña
            </h2>
            <p className="pz-panel__sub">
              Al cambiarla se cierran tus sesiones abiertas en otros equipos.
            </p>
          </div>
          <div className="pz-panel__body">
            {cambiada && (
              <p
                role="status"
                className="mb-3"
                style={{ color: "var(--pz-green-ink)", fontSize: "var(--fs-sm)" }}
              >
                Contraseña actualizada.
              </p>
            )}
            <FormularioCambioPassword onCambiada={() => setCambiada(true)} />
          </div>
        </section>
      </div>
    </div>
  );
}
