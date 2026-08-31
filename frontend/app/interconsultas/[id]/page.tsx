"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import type { Interconsulta, NivelPrioridad } from "@/types";
import { useInterconsultaDetalle } from "@/hooks/useInterconsultas";
import { usuarioActual } from "@/data/mock";
import DetalleInterconsulta from "@/components/interconsultas/DetalleInterconsulta";
import TarjetaPriorizacionIA from "@/components/interconsultas/TarjetaPriorizacionIA";
import BotonPriorizarIA from "@/components/interconsultas/BotonPriorizarIA";
import FormularioModificarPrioridad from "@/components/interconsultas/FormularioModificarPrioridad";
import HistorialModificaciones from "@/components/interconsultas/HistorialModificaciones";
import ResumenClinico from "@/components/interconsultas/ResumenClinico";
import TablaEntidades from "@/components/interconsultas/TablaEntidades";
import { useConfiguracionExport } from "@/hooks/useConfiguracionCampos";
import { exportarInterconsulta } from "@/utils/exportUtils";

interface PageProps {
  params: Promise<{ id: string }>;
}

type FormatoExportacion = "json" | "csv" | "xlsx";

interface OpcionExportacion {
  valor: FormatoExportacion;
  etiqueta: string;
  extension: string;
  mimeType: string;
}

const FORMATOS_EXPORTACION: OpcionExportacion[] = [
  { valor: "json", etiqueta: "JSON", extension: ".json", mimeType: "application/json" },
  { valor: "csv", etiqueta: "CSV", extension: ".csv", mimeType: "text/csv" },
  { valor: "xlsx", etiqueta: "Excel (XLSX)", extension: ".xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
];

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
  const { config, usuario, setUsuario } = useConfiguracionExport();
  const [actualizandoEstado, setActualizandoEstado] = useState(false);
  const [formatoSeleccionado, setFormatoSeleccionado] = useState<FormatoExportacion>("json");

  // Inicializar usuario en el context de configuración
  useEffect(() => {
    setUsuario({
      id: "1",
      nombre: usuarioActual.nombre,
      rol: "medico", // Default a médico, admin se configuraría desde auth real
    });
  }, [setUsuario]);

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
  const estaPriorizada = interconsulta.priorizacionIA.priorizada ?? true;
  const fueModificada =
    esValida &&
    interconsulta.prioridadActual !==
      interconsulta.priorizacionIA.nivelSugerido;

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

  const manejarExport = () => {
    if (!interconsulta) return;
    exportarInterconsulta(interconsulta, formatoSeleccionado, config);
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
