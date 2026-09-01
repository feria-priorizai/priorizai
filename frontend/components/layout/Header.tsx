"use client";

/**
 * Encabezado superior. La ruta actual se muestra como eyebrow mono, igual que
 * los numerales de sección de la landing.
 */

import { usePathname } from "next/navigation";
import { usuarioActual } from "@/data/sesion";

const titulosPorRuta: Record<string, { seccion: string; titulo: string }> = {
  "/dashboard": { seccion: "01 / Panel", titulo: "Dashboard" },
  "/interconsultas": { seccion: "02 / Lista de espera", titulo: "Interconsultas" },
  "/configuracion": { seccion: "03 / Ajustes", titulo: "Configuración" },
};

export default function Header() {
  const pathname = usePathname();

  const obtenerTitulo = () => {
    if (pathname.startsWith("/interconsultas/")) {
      return { seccion: "02 / Lista de espera", titulo: "Detalle de interconsulta" };
    }
    return titulosPorRuta[pathname] ?? { seccion: "PriorizAI", titulo: "PriorizAI" };
  };

  const { seccion, titulo } = obtenerTitulo();

  return (
    <header
      className="sticky top-0 z-10 flex h-[72px] flex-none items-center justify-between px-6"
      style={{
        background: "rgba(251,252,254,.88)",
        backdropFilter: "saturate(150%) blur(12px)",
        WebkitBackdropFilter: "saturate(150%) blur(12px)",
        borderBottom: "1px solid var(--pz-line-2)",
      }}
    >
      <div>
        <span className="pz-eyebrow">{seccion}</span>
        <h2 className="mt-1 text-[1.35rem]">{titulo}</h2>
      </div>

      <div className="text-right">
        <span className="pz-label">Establecimiento</span>
        <p className="mt-0.5 text-[.88rem] font-semibold text-[var(--pz-ink)]">
          {usuarioActual.centroSalud}
        </p>
      </div>
    </header>
  );
}
