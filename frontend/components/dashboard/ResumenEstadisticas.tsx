"use client";

import type { ReactNode } from "react";
import type { Interconsulta } from "@/types";
import TarjetaEstadistica from "@/components/ui/TarjetaEstadistica";

interface ResumenEstadisticasProps {
  interconsultas: Interconsulta[];
  /** Total en el servidor. Puede ser mayor que lo cargado. */
  total?: number;
}

export default function ResumenEstadisticas({
  interconsultas,
  total: totalServidor,
}: ResumenEstadisticasProps) {
  const total = totalServidor ?? interconsultas.length;
  const pendientes = interconsultas.filter((ic) => ic.estado === "pendiente").length;
  const revisadas = interconsultas.filter((ic) => ic.estado === "revisada").length;
  const prioridadAlta = interconsultas.filter(
    (ic) =>
      ic.esValidaParaPriorizacion !== false && ic.prioridadActual === "alta",
  ).length;
  const banderasRojas = interconsultas.filter((ic) => ic.banderaRoja).length;

  return (
    <section className="pz-rail" aria-label="Resumen de la lista de espera">
      <TarjetaEstadistica
        titulo="Total"
        valor={total}
        icono={<IconoClipboard />}
        acento="var(--pz-blue-deep)"
        acentoFondo="var(--primary-light)"
      />
      <TarjetaEstadistica
        titulo="Pendientes"
        valor={pendientes}
        icono={<IconoReloj />}
        acento="var(--pz-media)"
        acentoFondo="var(--pz-media-bg)"
      />
      <TarjetaEstadistica
        titulo="Revisadas"
        valor={revisadas}
        icono={<IconoCheck />}
        acento="var(--pz-green-ink)"
        acentoFondo="var(--pz-baja-bg)"
      />
      <TarjetaEstadistica
        titulo="Prioridad alta"
        valor={prioridadAlta}
        icono={<IconoAlerta />}
        acento="var(--pz-alta)"
        acentoFondo="var(--pz-alta-bg)"
      />
      <TarjetaEstadistica
        titulo="Banderas rojas"
        valor={banderasRojas}
        icono={<IconoBandera />}
        acento="var(--pz-purple-ink)"
        acentoFondo="#EAE2FB"
      />
    </section>
  );
}

function IconoBase({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
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

function IconoClipboard() {
  return (
    <IconoBase>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </IconoBase>
  );
}

function IconoReloj() {
  return (
    <IconoBase>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconoBase>
  );
}

function IconoCheck() {
  return (
    <IconoBase>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </IconoBase>
  );
}

function IconoAlerta() {
  return (
    <IconoBase>
      <path d="M10.3 4.4 2.8 17.5A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.5L13.7 4.4a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
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
