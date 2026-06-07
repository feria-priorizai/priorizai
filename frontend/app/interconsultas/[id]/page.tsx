"use client";

/**
 * Página de detalle de una interconsulta.
 * Integra las tres historias de usuario del MVP:
 *
 * - HdU01: Priorización automática (TarjetaPriorizacionIA)
 * - HdU02: Modificación de prioridad (FormularioModificarPrioridad + HistorialModificaciones)
 * - HdU03: Historial clínico resumido (ResumenClinico)
 *
 * Layout en dos columnas:
 * - Izquierda (2/3): Detalle general + Resumen clínico
 * - Derecha (1/3): Priorización IA + Modificar + Historial
 */

import { use } from "react";
import Link from "next/link";
import { useInterconsultaDetalle } from "@/hooks/useInterconsultas";
import DetalleInterconsulta from "@/components/interconsultas/DetalleInterconsulta";
import TarjetaPriorizacionIA from "@/components/interconsultas/TarjetaPriorizacionIA";
import FormularioModificarPrioridad from "@/components/interconsultas/FormularioModificarPrioridad";
import HistorialModificaciones from "@/components/interconsultas/HistorialModificaciones";
import ResumenClinico from "@/components/interconsultas/ResumenClinico";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function InterconsultaDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const { interconsulta, cargando, error, cambiarPrioridad } =
    useInterconsultaDetalle(id);

  if (cargando) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-[var(--text-secondary)]">
          Cargando interconsulta...
        </p>
      </div>
    );
  }

  if (error || !interconsulta) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-[var(--prioridad-alta)]">
          {error ?? "Interconsulta no encontrada"}
        </p>
        <Link
          href="/interconsultas"
          className="text-sm text-[var(--primary)] hover:underline"
        >
          Volver al listado
        </Link>
      </div>
    );
  }

  /** Determina si la prioridad fue modificada respecto a la sugerencia IA */
  const fueModificada =
    interconsulta.prioridadActual !==
    interconsulta.priorizacionIA.nivelSugerido;

  return (
    <div className="flex flex-col gap-6">
      {/* Enlace para volver al listado */}
      <Link
        href="/interconsultas"
        className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
      >
        ← Volver al listado
      </Link>

      {/* Layout principal en dos columnas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna izquierda: información general y resumen clínico */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Datos generales de la interconsulta */}
          <DetalleInterconsulta interconsulta={interconsulta} />

          {/* Resumen clínico del paciente (HdU03) */}
          <ResumenClinico pacienteId={interconsulta.pacienteId} />
        </div>

        {/* Columna derecha: priorización y acciones */}
        <div className="flex flex-col gap-6">
          {/* Resultado de la priorización automática (HdU01) */}
          <TarjetaPriorizacionIA
            priorizacion={interconsulta.priorizacionIA}
            prioridadActual={interconsulta.prioridadActual}
            fueModificada={fueModificada}
          />

          {/* Formulario para modificar prioridad (HdU02) */}
          <FormularioModificarPrioridad
            prioridadActual={interconsulta.prioridadActual}
            onModificar={cambiarPrioridad}
          />

          {/* Historial de cambios (HdU02) */}
          <HistorialModificaciones
            modificaciones={interconsulta.historialModificaciones}
          />
        </div>
      </div>
    </div>
  );
}
