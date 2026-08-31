"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { usuarioActual } from "@/data/mock";
import {
  EVENTO_INTERCONSULTAS_ACTUALIZADAS,
  EVENTO_ERRORES_CARGA,
  subirCsvInterconsultas,
} from "@/services/interconsultas";

interface ItemNavegacion {
  nombre: string;
  ruta: string;
  icono: "dashboard" | "interconsultas" | "configuracion";
}

interface NotificacionCarga {
  tipo: "success" | "error";
  titulo: string;
  detalle: string;
}

const itemsNavegacion: ItemNavegacion[] = [
  { nombre: "Dashboard", ruta: "/dashboard", icono: "dashboard" },
  { nombre: "Interconsultas", ruta: "/interconsultas", icono: "interconsultas" },
  { nombre: "Configuración", ruta: "/configuracion", icono: "configuracion" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [notificacion, setNotificacion] = useState<NotificacionCarga | null>(
    null,
  );
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement | null>(null);

  const esRutaActiva = (ruta: string) => pathname.startsWith(ruta);

  const manejarAbrirSelector = () => {
    inputArchivoRef.current?.click();
  };

  const manejarSeleccionArchivo = async (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0] ?? null;
    e.target.value = "";

    if (!archivo) {
      return;
    }

    const nombreArchivo = archivo.name.toLowerCase();
    if (!nombreArchivo.endsWith(".csv") && !nombreArchivo.endsWith(".xlsx")) {
      setNotificacion({
        tipo: "error",
        titulo: "Archivo no valido",
        detalle: "Sube un archivo CSV o XLSX.",
      });
      return;
    }

    setSubiendoArchivo(true);
    setNotificacion(null);

    try {
      const resultado = await subirCsvInterconsultas(archivo);
      const total = resultado.stored ?? resultado.inserted;
      const priorizadas = resultado.prioritized ?? 0;
      const rejectedCount = resultado.rejected_count ?? 0;

      // Si hay filas rechazadas, despachar evento para mostrar el modal
      if (rejectedCount > 0) {
        window.dispatchEvent(
          new CustomEvent(EVENTO_ERRORES_CARGA, {
            detail: {
              rejected: resultado.rejected,
              rejected_count: rejectedCount,
            },
          })
        );
      }

      window.dispatchEvent(new Event(EVENTO_INTERCONSULTAS_ACTUALIZADAS));

      let detalle = `${archivo.name}: ${total} interconsulta`;
      detalle += total !== 1 ? "s" : "";
      detalle += ` guardada${total !== 1 ? "s" : ""}`;
      if (priorizadas > 0) {
        detalle += `. ${priorizadas} priorizada${priorizadas !== 1 ? "s" : ""} con IA`;
      }
      if (rejectedCount > 0) {
        detalle += `. ${rejectedCount} fila`;
        detalle += rejectedCount !== 1 ? "s" : "";
        detalle += " incompleta(s) no guardada(s)";
      }

      setNotificacion({
        tipo: "success",
        titulo: "Carga completada",
        detalle,
      });
    } catch (error) {
      setNotificacion({
        tipo: "error",
        titulo: "No se pudo cargar",
        detalle:
          error instanceof Error
            ? error.message
            : "Revisa el archivo e intenta nuevamente.",
      });
    } finally {
      setSubiendoArchivo(false);
    }
  };

  useEffect(() => {
    if (!notificacion) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNotificacion(null);
    }, 6000);

    return () => window.clearTimeout(timeoutId);
  }, [notificacion]);

  return (
    <aside className="flex h-full w-64 flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-text)]">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
          PA
        </div>
        <div>
          <h1 className="text-base font-bold text-white">PriorizAI</h1>
          <p className="text-xs text-[var(--sidebar-text)]">
            Sistema de priorizacion
          </p>
        </div>
      </div>

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
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-white/10">
                    <IconoNavegacion tipo={item.icono} />
                  </span>
                  {item.nombre}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {notificacion && (
        <div className="px-4 pb-3">
          <div
            role="status"
            aria-live="polite"
            className={`rounded-lg border px-3 py-3 text-sm shadow-sm ${
              notificacion.tipo === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{notificacion.titulo}</p>
                <p className="mt-1 break-words text-xs leading-relaxed">
                  {notificacion.detalle}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar notificacion"
                onClick={() => setNotificacion(null)}
                className="rounded px-1.5 py-0.5 text-xs font-semibold hover:bg-black/10"
              >
                X
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-white/10 px-4 py-4">
        <div className="mb-4">
          <input
            ref={inputArchivoRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={manejarSeleccionArchivo}
          />
          <button
            type="button"
            onClick={manejarAbrirSelector}
            disabled={subiendoArchivo}
            className="flex w-full items-center justify-center rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--sidebar-active)] hover:text-[var(--sidebar-text-active)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {subiendoArchivo ? "Cargando archivo..." : "Cargar archivo"}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">
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

function IconoNavegacion({ tipo }: { tipo: ItemNavegacion["icono"] }) {
  if (tipo === "dashboard") {
    return (
      <IconoBase>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </IconoBase>
    );
  }

  if (tipo === "configuracion") {
    return (
      <IconoBase>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </IconoBase>
    );
  }

  return (
    <IconoBase>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </IconoBase>
  );
}

function IconoBase({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
