"use client";

import { use, useEffect, useState } from "react";
import type { NivelPrioridad } from "@/types";
import { useInterconsultaDetalle } from "@/hooks/useInterconsultas";
import { usuarioActual } from "@/data/sesion";
import PanelDecision from "@/components/interconsultas/PanelDecision";
import DetalleInterconsulta from "@/components/interconsultas/DetalleInterconsulta";
import HistorialModificaciones from "@/components/interconsultas/HistorialModificaciones";
import ResumenClinico from "@/components/interconsultas/ResumenClinico";
import TablaEntidades from "@/components/interconsultas/TablaEntidades";
import { useConfiguracionExport } from "@/hooks/useConfiguracionCampos";
import { exportarInterconsulta } from "@/utils/exportUtils";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

type FormatoExportacion = "json" | "csv" | "xlsx";

/**
 * Detalle de interconsulta: a la izquierda la decisión clínica, fija; a la
 * derecha el sustento que la respalda, con scroll propio.
 */
export default function InterconsultaDetallePage({ params }: PageProps) {
  const { id } = use(params);
  const {
    interconsulta,
    cargando,
    error,
    cambiarPrioridad,
    cambiarEstado,
    priorizarConIA,
  } = useInterconsultaDetalle(id);
  const { config, setUsuario } = useConfiguracionExport();
  const [actualizandoEstado, setActualizandoEstado] = useState(false);
  const [formato, setFormato] = useState<FormatoExportacion>("json");

  useEffect(() => {
    setUsuario({
      id: usuarioActual.id,
      nombre: usuarioActual.nombre,
      rol: "medico",
    });
  }, [setUsuario]);

  if (cargando) {
    return <EstadoVista tipo="cargando" texto="Cargando interconsulta…" />;
  }

  if (error || !interconsulta) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <EstadoVista
          tipo="error"
          texto={error ?? "Interconsulta no encontrada"}
        />
        <Link href="/interconsultas" className="pz-btn pz-btn--ghost">
          Volver al listado
        </Link>
      </div>
    );
  }

  const marcarComoRevisada = async () => {
    setActualizandoEstado(true);
    await cambiarEstado("revisada");
    setActualizandoEstado(false);
  };

  // Modificar la prioridad es en si el acto de revisar la interconsulta,
  // por lo que el estado pasa a "revisada" junto con el cambio.
  const modificarPrioridad = async (
    nuevaPrioridad: NivelPrioridad,
    motivo: string,
  ): Promise<boolean> => {
    const exito = await cambiarPrioridad(nuevaPrioridad, motivo);
    if (exito && interconsulta.estado === "pendiente") {
      await cambiarEstado("revisada");
    }
    return exito;
  };

  return (
    <div className="row g-4">
      <div className="col-12 col-lg-5 col-xl-4">
        <PanelDecision
          interconsulta={interconsulta}
          medicoResponsable={usuarioActual.nombre}
          actualizandoEstado={actualizandoEstado}
          formato={formato}
          onCambiarFormato={setFormato}
          onExportar={() =>
            exportarInterconsulta(interconsulta, formato, config)
          }
          onMarcarRevisada={marcarComoRevisada}
          onModificarPrioridad={modificarPrioridad}
          onPriorizarConIA={priorizarConIA}
        />
      </div>

      <div className="col-12 col-lg-7 col-xl-8">
        <div className="flex flex-col gap-4">
          <DetalleInterconsulta interconsulta={interconsulta} />
          <ResumenClinico
            pacienteId={interconsulta.pacienteId}
            entidades={interconsulta.entidades}
          />
          <TablaEntidades
            entidades={interconsulta.entidades}
            error={interconsulta.entidadesError}
          />
        </div>

        <div className="flex flex-col gap-6">
          {esValida && (
            <TarjetaPriorizacionIA
              priorizacion={interconsulta.priorizacionIA}
              prioridadActual={interconsulta.prioridadActual}
              fueModificada={fueModificada}
              prioridadForzadaPorRegla={interconsulta.prioridadForzadaPorRegla}
              terminosBanderaRoja={interconsulta.terminosBanderaRoja}
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

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
            <div className="flex flex-col gap-3">
              <label
                htmlFor="formato-exportacion"
                className="text-sm font-medium text-[var(--text-primary)]"
              >
                Exportar interconsulta
              </label>
              <select
                id="formato-exportacion"
                value={formatoSeleccionado}
                onChange={(e) => setFormatoSeleccionado(e.target.value as FormatoExportacion)}
                disabled={interconsulta.estado !== "revisada"}
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {FORMATOS_EXPORTACION.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={manejarExport}
                disabled={interconsulta.estado !== "revisada"}
                title={interconsulta.estado !== "revisada" ? "La interconsulta debe estar revisada para poder exportar" : undefined}
                className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Descargar {FORMATOS_EXPORTACION.find((f) => f.valor === formatoSeleccionado)?.etiqueta}
              </button>
              {interconsulta.estado !== "revisada" && (
                <p className="text-xs text-[var(--text-muted)]">
                  Debe marcar la interconsulta como revisada para exportar
                </p>
              )}
            </div>
          </div>

          {esValida &&
            (estaPriorizada ? (
              <FormularioModificarPrioridad
                prioridadActual={interconsulta.prioridadActual}
                medicoResponsable={usuarioActual.nombre}
                onModificar={modificarPrioridad}
              />
            ) : (
              <BotonPriorizarIA
                priorizada={estaPriorizada}
                esValida={esValida}
                onPriorizar={priorizarConIA}
              />
            ))}

          <HistorialModificaciones
            modificaciones={interconsulta.historialModificaciones}
          />
        </div>
      </div>
    </div>
  );
}
