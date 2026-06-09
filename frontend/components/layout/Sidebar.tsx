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
import { useRef, useState, useEffect, type ChangeEvent } from "react";
import { usuarioActual } from "@/data/mock";
import { subirCsvInterconsultas } from "@/services/interconsultas";

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
  const [archivoCSV, setArchivoCSV] = useState<File | null>(null);
  const [estadoCSV, setEstadoCSV] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<"success" | "error" | null>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [subiendoCSV, setSubiendoCSV] = useState(false);
  const inputCsvRef = useRef<HTMLInputElement | null>(null);

  /** Verifica si una ruta está activa (incluye sub-rutas) */
  const esRutaActiva = (ruta: string) => pathname.startsWith(ruta);

  const manejarAbrirSelectorCSV = () => {
    inputCsvRef.current?.click();
  };

  const manejarSeleccionCSV = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0] ?? null;
    if (!archivo) return;

    setEstadoCSV(null);
    setNotificationType(null);
    if (!archivo.name.toLowerCase().endsWith(".csv")) {
      setArchivoCSV(null);
      setEstadoCSV("Solo se permiten archivos CSV.");
      setNotificationType("error");
      setNotificationVisible(true);
      return;
    }

    setArchivoCSV(archivo);
    setSubiendoCSV(true);

    try {
      await subirCsvInterconsultas(archivo);
      setEstadoCSV(`${archivo.name} cargado con éxito`);
      setNotificationType("success");
      setNotificationVisible(true);
    } catch (error) {
      setEstadoCSV(
        error instanceof Error
          ? error.message
          : "Error al cargar el archivo CSV.",
      );
      setArchivoCSV(null);
      setNotificationType("error");
      setNotificationVisible(true);
    } finally {
      setSubiendoCSV(false);
    }
  };

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (!notificationVisible) return;
    const t = setTimeout(() => {
      setNotificationVisible(false);
      setEstadoCSV(null);
      setNotificationType(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [notificationVisible]);

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
                      : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-text-active)]"
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

      {/* Notification area: appears above the separator and the upload button */}
      {notificationVisible && estadoCSV && (
        <div className="px-4 py-3">
          <div
            role="status"
            aria-live="polite"
            className={`relative rounded-md px-3 py-2 text-sm shadow-sm transition-opacity ${
              notificationType === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            <button
              aria-label="Cerrar notificación"
              onClick={() => {
                setNotificationVisible(false);
                setEstadoCSV(null);
                setNotificationType(null);
              }}
              className="absolute top-1 right-1 rounded p-1 text-xs font-medium hover:bg-white/30"
            >
              ✖
            </button>

            <div className="flex items-start gap-2">
              <div className="text-lg mt-0.5">{notificationType === "success" ? "✅" : "❌"}</div>
              <div className="min-w-0 break-words whitespace-normal">
                <p>{estadoCSV}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Carga de CSV desde el sidebar */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="mb-4">
          <input
            ref={inputCsvRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={manejarSeleccionCSV}
          />
          <button
            type="button"
            onClick={manejarAbrirSelectorCSV}
            disabled={subiendoCSV}
            className="flex w-full items-center justify-center rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-text-active)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {subiendoCSV ? "Subiendo CSV..." : "Cargar CSV"}
          </button>
          
        </div>

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
