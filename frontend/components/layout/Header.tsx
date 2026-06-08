"use client";

/**
 * Encabezado superior de la aplicación.
 * Muestra el título de la sección actual y el centro de salud del usuario.
 * Preparado para incluir barra de búsqueda y notificaciones en futuras HdU.
 */

import { usePathname } from "next/navigation";
import { usuarioActual } from "@/data/mock";

/** Mapeo de rutas a títulos legibles */
const titulosPorRuta: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/interconsultas": "Interconsultas",
};

export default function Header() {
  const pathname = usePathname();

  /** Obtiene el título según la ruta actual, con fallback para sub-rutas */
  const obtenerTitulo = (): string => {
    if (pathname.startsWith("/interconsultas/")) return "Detalle Interconsulta";
    return titulosPorRuta[pathname] ?? "PriorizAI";
  };

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6 shadow-[var(--shadow-sm)]">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        {obtenerTitulo()}
      </h2>

      <div className="flex items-center gap-4">
        <span className="text-sm text-[var(--text-secondary)]">
          {usuarioActual.centroSalud}
        </span>
      </div>
    </header>
  );
}
