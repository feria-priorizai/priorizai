"use client";

/**
 * Encabezado superior: a la izquierda la ruta actual, a la derecha el
 * establecimiento con su logo.
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usuarioActual } from "@/data/sesion";

const titulosPorRuta: Record<string, { seccion: string; titulo: string }> = {
  "/dashboard": { seccion: "Panel", titulo: "Dashboard" },
  "/interconsultas": { seccion: "Lista de espera", titulo: "Interconsultas" },
  "/configuracion": { seccion: "Ajustes", titulo: "Configuración" },
};

/** El logo del establecimiento se deja caer en public/img/. Mientras no esté,
 *  se muestra el emblema y el nombre, sin imagen rota. */
const LOGO_ESTABLECIMIENTO = "/img/hospital-san-juan-de-dios.png";

export default function Header() {
  const pathname = usePathname();
  const [hayLogo, setHayLogo] = useState(false);

  // Se comprueba en memoria antes de montar el <img>: si el establecimiento
  // todavia no subio su logo, se muestra el emblema y el nombre en vez de una
  // imagen rota.
  useEffect(() => {
    const prueba = new Image();
    prueba.onload = () => setHayLogo(true);
    prueba.src = LOGO_ESTABLECIMIENTO;
  }, []);

  const obtenerTitulo = () => {
    if (pathname.startsWith("/interconsultas/")) {
      return { seccion: "Lista de espera", titulo: "Detalle de interconsulta" };
    }
    return titulosPorRuta[pathname] ?? { seccion: "PriorizAI", titulo: "PriorizAI" };
  };

  const { seccion, titulo } = obtenerTitulo();

  return (
    <header
      className="sticky top-0 z-10 flex flex-none items-center justify-between gap-4 px-7"
      style={{
        minHeight: "86px",
        background: "rgba(198,215,240,.9)",
        backdropFilter: "saturate(160%) blur(14px)",
        WebkitBackdropFilter: "saturate(160%) blur(14px)",
        borderBottom: "2px solid var(--pz-line-2)",
      }}
    >
      <div className="min-w-0">
        <span className="pz-eyebrow">{seccion}</span>
        <h1 className="mt-1.5" style={{ fontSize: "var(--fs-xl)" }}>
          {titulo}
        </h1>
      </div>

      <div className="flex flex-none items-center gap-3">
        {hayLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={LOGO_ESTABLECIMIENTO}
            alt={usuarioActual.centroSalud}
            style={{ height: "56px", width: "auto", display: "block" }}
          />
        ) : (
          <>
            <span
              className="flex h-12 w-12 flex-none items-center justify-center"
              style={{
                background: "var(--pz-paper)",
                border: "2px solid var(--pz-line-2)",
                borderRadius: "var(--radius-sm)",
                color: "var(--pz-alta)",
              }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                <path d="M9.5 2h5v5.5H20v5h-5.5V18h-5v-5.5H4v-5h5.5V2Z" />
              </svg>
            </span>
            <div className="text-right">
              <span className="pz-label">Establecimiento</span>
              <p
                className="mt-0.5 mb-0 font-semibold"
                style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink)" }}
              >
                {usuarioActual.centroSalud}
              </p>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
