"use client";

import type { ReactNode } from "react";
import type { Interconsulta } from "@/types";
import TarjetaEstadistica from "@/components/ui/TarjetaEstadistica";

interface ResumenEstadisticasProps {
  interconsultas: Interconsulta[];
}

export default function ResumenEstadisticas({
  interconsultas,
}: ResumenEstadisticasProps) {
  const total = interconsultas.length;
  const pendientes = interconsultas.filter((ic) => ic.estado === "pendiente").length;
  const revisadas = interconsultas.filter((ic) => ic.estado === "revisada").length;
  const prioridadAlta = interconsultas.filter(
    (ic) =>
      ic.esValidaParaPriorizacion !== false && ic.prioridadActual === "alta",
  ).length;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <TarjetaEstadistica
        titulo="Total interconsultas"
        valor={total}
        icono={<IconoClipboard />}
      />
      <TarjetaEstadistica
        titulo="Pendientes"
        valor={pendientes}
        icono={<IconoReloj />}
        colorAccento="var(--estado-pendiente)"
      />
      <TarjetaEstadistica
        titulo="Revisadas"
        valor={revisadas}
        icono={<IconoCheck />}
        colorAccento="var(--estado-revisada)"
      />
      <TarjetaEstadistica
        titulo="Prioridad alta"
        valor={prioridadAlta}
        icono={<IconoAlerta />}
        colorAccento="var(--prioridad-alta)"
      />
    </div>
  );
}

function IconoBase({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
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
