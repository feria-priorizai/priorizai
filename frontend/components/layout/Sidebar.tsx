"use client";

/**
 * Barra lateral de navegación principal.
 * Muestra las secciones del sistema según el contexto del MVP:
 * - Dashboard
 * - Interconsultas (lista y gestión)
 * - Info del usuario actual
 *
 * Preparado para agregar más secciones (configuración, reportes, etc.)
 * cuando se implementen las historias de usuario adicionales.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usuarioActual } from "@/data/mock";

/** Elemento del menú de navegación */
interface ItemNavegacion {
  nombre: string;
  ruta: string;
  icono: string;
}

/** Secciones disponibles en el MVP */
const itemsNavegacion: ItemNavegacion[] = [
  { nombre: "Dashboard", ruta: "/dashboard", icono: "📊" },
  { nombre: "Interconsultas", ruta: "/interconsultas", icono: "📋" },
];

export default function Sidebar() {
  const pathname = usePathname();

  /** Verifica si una ruta está activa (incluye sub-rutas) */
  const esRutaActiva = (ruta: string) => pathname.startsWith(ruta);

  return (
    <aside className="flex h-full w-64 flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-text)]">
      {/* Logo y nombre del sistema */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-white font-bold text-sm">
          PA
        </div>
        <div>
          <h1 className="text-base font-bold text-white">PriorizAI</h1>
          <p className="text-xs text-[var(--sidebar-text)]">Sistema de priorización</p>
        </div>
      </div>

      {/* Navegación principal */}
      <nav className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1">
          {itemsNavegacion.map((item) => {
            const activo = esRutaActiva(item.ruta);
            return (
              <li key={item.ruta}>
                <Link
                  href={item.ruta}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    activo
                      ? "bg-[var(--sidebar-active)] text-[var(--sidebar-text-active)]"
                      : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-text-active)]"
                  }`}
                >
                  <span className="text-lg">{item.icono}</span>
                  {item.nombre}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Información del usuario autenticado */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-white text-xs font-bold">
            {usuarioActual.nombre
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {usuarioActual.nombre}
            </p>
            <p className="truncate text-xs text-[var(--sidebar-text)]">
              {usuarioActual.especialidad}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
