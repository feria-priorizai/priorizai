"use client";

import { use, useState } from "react";
import Link from "next/link";
import type { Interconsulta } from "@/types";
import { useInterconsultaDetalle } from "@/hooks/useInterconsultas";
import DetalleInterconsulta from "@/components/interconsultas/DetalleInterconsulta";
import TarjetaPriorizacionIA from "@/components/interconsultas/TarjetaPriorizacionIA";
import FormularioModificarPrioridad from "@/components/interconsultas/FormularioModificarPrioridad";
import HistorialModificaciones from "@/components/interconsultas/HistorialModificaciones";
import ResumenClinico from "@/components/interconsultas/ResumenClinico";
import { formatearFechaHoraChileLarga } from "@/utils/fechas";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function InterconsultaDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const { interconsulta, cargando, error, cambiarPrioridad, cambiarEstado } =
    useInterconsultaDetalle(id);
  const [actualizandoEstado, setActualizandoEstado] = useState(false);

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

  const esValida = interconsulta.esValidaParaPriorizacion ?? true;
  const fueModificada =
    esValida &&
    interconsulta.prioridadActual !==
      interconsulta.priorizacionIA.nivelSugerido;

  const marcarComoRevisada = async () => {
    setActualizandoEstado(true);
    await cambiarEstado("revisada");
    setActualizandoEstado(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/interconsultas"
        className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
      >
        {"<-"} Volver al listado
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DetalleInterconsulta interconsulta={interconsulta} />
          <ResumenClinico pacienteId={interconsulta.pacienteId} />
        </div>

        <div className="flex flex-col gap-6">
          {esValida && (
            <TarjetaPriorizacionIA
              priorizacion={interconsulta.priorizacionIA}
              prioridadActual={interconsulta.prioridadActual}
              fueModificada={fueModificada}
            />
          )}

          {interconsulta.estado === "pendiente" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <button
                type="button"
                onClick={marcarComoRevisada}
                disabled={actualizandoEstado}
                className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actualizandoEstado ? "Actualizando..." : "Marcar como revisada"}
              </button>
            </div>
          )}

          {interconsulta.estado === "revisada" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--estado-revisada)]">
                <span aria-hidden>{"✓"}</span>
                <span>Interconsulta revisada</span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Revisada el{" "}
                {formatearFechaHoraChileLarga(interconsulta.fechaActualizacion)}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
            <button
              type="button"
              onClick={() => descargarInterconsultaJson(interconsulta)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              Exportar interconsulta en formato JSON
            </button>
          </div>

          {esValida && (
            <FormularioModificarPrioridad
              prioridadActual={interconsulta.prioridadActual}
              onModificar={cambiarPrioridad}
            />
          )}

          <HistorialModificaciones
            modificaciones={interconsulta.historialModificaciones}
          />
        </div>
      </div>
    </div>
  );
}

function descargarInterconsultaJson(interconsulta: Interconsulta) {
  const payload = {
    exportadoEn: new Date().toISOString(),
    formato: "priorizai.interconsulta.v1",
    interconsulta,
  };
  const contenido = JSON.stringify(payload, null, 2);
  const blob = new Blob([contenido], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `interconsulta-${interconsulta.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
