"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useSesion } from "@/context/SesionContext";
import { ETIQUETAS_ROL } from "@/types/usuario";
import {
  EVENTO_ERRORES_CARGA,
  EVENTO_INTERCONSULTAS_ACTUALIZADAS,
  reevaluarBanderasRojas,
  subirCsvInterconsultas,
} from "@/services/interconsultas";
import { useConfiguracionImport } from "@/hooks/useConfiguracionCampos";

interface ItemNavegacion {
  nombre: string;
  ruta: string;
  icono: "dashboard" | "interconsultas" | "configuracion" | "usuarios";
}

interface Notificacion {
  tipo: "success" | "error";
  titulo: string;
  detalle: string;
}

const itemsNavegacion: ItemNavegacion[] = [
  { nombre: "Dashboard", ruta: "/dashboard", icono: "dashboard" },
  { nombre: "Interconsultas", ruta: "/interconsultas", icono: "interconsultas" },
  { nombre: "Configuración", ruta: "/configuracion", icono: "configuracion" },
];

const itemUsuarios: ItemNavegacion = {
  nombre: "Usuarios",
  ruta: "/usuarios",
  icono: "usuarios",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { usuario, cerrarSesion } = useSesion();
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const items =
    usuario.rol === "administrador"
      ? [...itemsNavegacion, itemUsuarios]
      : itemsNavegacion;
  const { camposObligatorios } = useConfiguracionImport();
  const [colapsado, setColapsado] = useState(false);
  const [notificacion, setNotificacion] = useState<Notificacion | null>(null);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [reevaluando, setReevaluando] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement | null>(null);

  const esRutaActiva = (ruta: string) => pathname.startsWith(ruta);

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
      const resultado = await subirCsvInterconsultas(
        archivo,
        camposObligatorios,
      );
      const total = resultado.stored ?? resultado.inserted;
      const priorizadas = resultado.prioritized ?? 0;
      const explicaciones = resultado.explanations_queued ?? 0;
      const rechazadas = resultado.rejected_count ?? 0;

      if (rechazadas > 0) {
        window.dispatchEvent(
          new CustomEvent(EVENTO_ERRORES_CARGA, {
            detail: {
              rejected: resultado.rejected,
              rejected_count: rechazadas,
            },
          }),
        );
      }

      window.dispatchEvent(new Event(EVENTO_INTERCONSULTAS_ACTUALIZADAS));

      let detalle = `${archivo.name}: ${total} guardada${total !== 1 ? "s" : ""}`;
      if (priorizadas > 0) {
        detalle += `, ${priorizadas} priorizada${priorizadas !== 1 ? "s" : ""} con IA`;
      }
      if (explicaciones > 0) {
        detalle += `. Sus explicaciones se calculan en segundo plano, de a una (unos ${Math.round(explicaciones * 3.5)} min)`;
      }
      if (rechazadas > 0) {
        detalle += `, ${rechazadas} incompleta${rechazadas !== 1 ? "s" : ""} no guardada${
          rechazadas !== 1 ? "s" : ""
        }`;
      }

      setNotificacion({ tipo: "success", titulo: "Carga completada", detalle });
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

  const manejarReevaluarBanderas = async () => {
    setReevaluando(true);
    setNotificacion(null);

    try {
      const resultado = await reevaluarBanderasRojas();
      window.dispatchEvent(new Event(EVENTO_INTERCONSULTAS_ACTUALIZADAS));
      setNotificacion({
        tipo: "success",
        titulo: "Banderas reevaluadas",
        detalle: `${resultado.total_evaluadas} evaluada${
          resultado.total_evaluadas !== 1 ? "s" : ""
        }, ${resultado.total_con_bandera_roja} con bandera roja.`,
      });
    } catch (error) {
      setNotificacion({
        tipo: "error",
        titulo: "No se pudo reevaluar",
        detalle:
          error instanceof Error
            ? error.message
            : "Intenta nuevamente en unos momentos.",
      });
    } finally {
      setReevaluando(false);
    }
  };

  useEffect(() => {
    if (!notificacion) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNotificacion(null), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [notificacion]);

  const manejarCerrarSesion = async () => {
    setCerrandoSesion(true);
    await cerrarSesion();
  };

  const iniciales = usuario.nombre
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <aside
      className={`pz-sidebar custom-scrollbar flex h-full flex-none flex-col overflow-y-auto ${
        colapsado ? "pz-sidebar--colapsado" : ""
      }`}
    >
      <div
        className={`flex items-center gap-2 px-4 py-4 ${
          colapsado ? "justify-center" : "justify-between"
        }`}
        style={{ borderBottom: "1px solid var(--pz-night-line)" }}
      >
        {!colapsado && (
          <Link href="/dashboard" aria-label="PriorizAI, ir al dashboard">
            <Image
              src="/img/logo-priorizai-white.png"
              alt="PriorizAI"
              width={150}
              height={30}
              priority
              className="h-[24px] w-auto"
            />
          </Link>
        )}

        <button
          type="button"
          onClick={() => setColapsado((v) => !v)}
          className="pz-toggle"
          aria-expanded={!colapsado}
          title={colapsado ? "Expandir menú" : "Contraer menú"}
          aria-label={colapsado ? "Expandir menú" : "Contraer menú"}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            style={{ transform: colapsado ? "rotate(180deg)" : undefined }}
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      </div>

      <nav className="px-3 pt-4">
        {!colapsado && <span className="pz-nav-group">Navegación</span>}
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.ruta}>
              <Link
                href={item.ruta}
                title={colapsado ? item.nombre : undefined}
                aria-current={esRutaActiva(item.ruta) ? "page" : undefined}
                className={`pz-navlink ${colapsado ? "pz-navlink--icono" : ""} ${
                  esRutaActiva(item.ruta) ? "is-active" : ""
                }`}
              >
                <IconoNavegacion tipo={item.icono} />
                {!colapsado && item.nombre}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="px-3 pt-6">
        {!colapsado && <span className="pz-nav-group">Acciones</span>}
        <input
          ref={inputArchivoRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={manejarSeleccionArchivo}
        />
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => inputArchivoRef.current?.click()}
            disabled={subiendoArchivo}
            title={colapsado ? "Cargar archivo" : undefined}
            className={`pz-btn pz-btn--nav pz-btn--block ${
              colapsado ? "pz-btn--icono" : ""
            }`}
          >
            <IconoSubir />
            {!colapsado && (subiendoArchivo ? "Cargando…" : "Cargar archivo")}
          </button>

          <button
            type="button"
            onClick={manejarReevaluarBanderas}
            disabled={reevaluando}
            title={colapsado ? "Reevaluar banderas" : undefined}
            className={`pz-btn pz-btn--nav pz-btn--block ${
              colapsado ? "pz-btn--icono" : ""
            }`}
          >
            <IconoBandera />
            {!colapsado && (reevaluando ? "Reevaluando…" : "Reevaluar banderas")}
          </button>
        </div>
      </div>

      <div className="flex-1" />

      {notificacion && !colapsado && (
        <div className="px-3 pb-3">
          <div
            role="status"
            aria-live="polite"
            className="px-3 py-2.5"
            style={{
              borderRadius: "2px",
              borderLeft: `2px solid ${
                notificacion.tipo === "success"
                  ? "var(--pz-green)"
                  : "var(--pz-alta)"
              }`,
              background:
                notificacion.tipo === "success"
                  ? "rgba(9,188,138,.1)"
                  : "rgba(194,43,43,.12)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className="pz-mono font-bold tracking-[.1em] uppercase"
                  style={{
                    fontSize: "var(--fs-micro)",
                    color:
                      notificacion.tipo === "success" ? "#5FE3BC" : "#FF9E9E",
                  }}
                >
                  {notificacion.titulo}
                </p>
                <p
                  className="mt-1.5 leading-relaxed break-words text-[rgba(226,236,248,.78)]"
                  style={{ fontSize: "var(--fs-sm)" }}
                >
                  {notificacion.detalle}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar notificación"
                onClick={() => setNotificacion(null)}
                className="pz-mono flex-none px-1 text-[.7rem] text-[rgba(226,236,248,.55)] hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`flex items-center gap-3 px-4 py-4 ${
          colapsado ? "justify-center" : ""
        }`}
        style={{ borderTop: "1px solid var(--pz-night-line)" }}
      >
        <div
          className="pz-mono flex h-11 w-11 flex-none items-center justify-center font-bold"
          style={{
            background: "var(--pz-green)",
            color: "#04241B",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--fs-sm)",
            letterSpacing: ".04em",
          }}
          title={colapsado ? usuario.nombre : undefined}
        >
          {iniciales}
        </div>
        {!colapsado && (
          <div className="min-w-0">
            <p
              className="mb-0 truncate font-semibold text-white"
              style={{ fontSize: "var(--fs-base)" }}
            >
              {usuario.nombre}
            </p>
            <p
              className="pz-mono mb-0 truncate uppercase"
              style={{
                fontSize: "var(--fs-micro)",
                color: "rgba(226,236,248,.62)",
                letterSpacing: ".1em",
              }}
            >
              {usuario.especialidad ?? ETIQUETAS_ROL[usuario.rol]}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-3 pb-4">
        <Link
          href="/cuenta"
          title={colapsado ? "Mi cuenta" : undefined}
          aria-label={colapsado ? "Mi cuenta" : undefined}
          aria-current={esRutaActiva("/cuenta") ? "page" : undefined}
          className={`pz-btn pz-btn--nav pz-btn--block ${
            colapsado ? "pz-btn--icono" : ""
          }`}
        >
          <IconoCuenta />
          {!colapsado && "Mi cuenta"}
        </Link>
        <button
          type="button"
          onClick={manejarCerrarSesion}
          disabled={cerrandoSesion}
          title={colapsado ? "Cerrar sesión" : undefined}
          aria-label={colapsado ? "Cerrar sesión" : undefined}
          className={`pz-btn pz-btn--nav pz-btn--block ${
            colapsado ? "pz-btn--icono" : ""
          }`}
        >
          <IconoSalir />
          {!colapsado && (cerrandoSesion ? "Cerrando…" : "Cerrar sesión")}
        </button>
      </div>
    </aside>
  );
}

function IconoNavegacion({ tipo }: { tipo: ItemNavegacion["icono"] }) {
  if (tipo === "dashboard") {
    return (
      <IconoBase>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </IconoBase>
    );
  }

  if (tipo === "usuarios") {
    return (
      <IconoBase>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
        <path d="M18 14.3c2.1.7 3.5 2.8 3.5 5.7" />
      </IconoBase>
    );
  }

  if (tipo === "configuracion") {
    return (
      <IconoBase>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2" />
      </IconoBase>
    );
  }

  return (
    <IconoBase>
      <rect x="8" y="2" width="8" height="4" />
      <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </IconoBase>
  );
}

function IconoSubir() {
  return (
    <IconoBase>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 17v3h16v-3" />
    </IconoBase>
  );
}

function IconoCuenta() {
  return (
    <IconoBase>
      <rect x="5" y="10" width="14" height="11" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </IconoBase>
  );
}

function IconoSalir() {
  return (
    <IconoBase>
      <path d="M14 4h5v16h-5" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h10" />
    </IconoBase>
  );
}

function IconoBandera() {
  return (
    <IconoBase>
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4L18 12H5" />
    </IconoBase>
  );
}

function IconoBase({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {children}
    </svg>
  );
}
