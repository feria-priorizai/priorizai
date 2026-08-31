"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { NivelPrioridad } from "@/types";
import { useInterconsultaDetalle } from "@/hooks/useInterconsultas";
import { usuarioActual } from "@/data/sesion";
import DetalleInterconsulta from "@/components/interconsultas/DetalleInterconsulta";
import TarjetaPriorizacionIA from "@/components/interconsultas/TarjetaPriorizacionIA";
import BotonPriorizarIA from "@/components/interconsultas/BotonPriorizarIA";
import FormularioModificarPrioridad from "@/components/interconsultas/FormularioModificarPrioridad";
import HistorialModificaciones from "@/components/interconsultas/HistorialModificaciones";
import ResumenClinico from "@/components/interconsultas/ResumenClinico";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import BadgeEstado from "@/components/ui/BadgeEstado";
import EstadoVista from "@/components/ui/EstadoVista";
import { useConfiguracionExport } from "@/hooks/useConfiguracionCampos";
import { exportarInterconsulta } from "@/utils/exportUtils";

interface PageProps {
  params: Promise<{ id: string }>;
}

type FormatoExportacion = "json" | "csv" | "xlsx";

const FORMATOS_EXPORTACION: { valor: FormatoExportacion; etiqueta: string }[] = [
  { valor: "json", etiqueta: "JSON" },
  { valor: "csv", etiqueta: "CSV" },
  { valor: "xlsx", etiqueta: "XLSX" },
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
        <BotonVolver />
      </div>
    );
  }

  const esValida = interconsulta.esValidaParaPriorizacion ?? true;
  // HU2-c1 exige que la interconsulta este "priorizada por el sistema", no que
  // haya corrido el modelo: una prioridad forzada por la regla de banderas rojas
  // tambien es del sistema, y es justo el caso donde el medico mas necesita
  // poder corregirla. La senal correcta es tener prioridad, no tener sugerencia.
  const tienePrioridad = !interconsulta.sinPrioridad;
  const estaPriorizadaPorIA = interconsulta.priorizacionIA.priorizada ?? true;
  const estaRevisada = interconsulta.estado === "revisada";
  const fueModificada =
    esValida &&
    interconsulta.prioridadActual !== interconsulta.priorizacionIA.nivelSugerido;

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
    <div className="flex flex-col gap-5">
      {/* Identidad y acciones, siempre a la vista al hacer scroll. */}
      <div className="pz-barra">
        <BotonVolver />

        <span className="pz-barra__id">
          {interconsulta.id.slice(0, 8).toUpperCase()}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {esValida &&
            (interconsulta.sinPrioridad ? (
              <span className="pz-label">Sin prioridad</span>
            ) : (
              <BadgePrioridad prioridad={interconsulta.prioridadActual} />
            ))}
          <BadgeEstado estado={interconsulta.estado} />
        </div>

        <div className="pz-form ms-auto flex flex-wrap items-center gap-2">
          {!estaRevisada && (
            <button
              type="button"
              onClick={marcarComoRevisada}
              disabled={actualizandoEstado}
              className="pz-btn pz-btn--solid pz-btn--mini"
            >
              {actualizandoEstado ? "Actualizando…" : "Marcar como revisada"}
            </button>
          )}

          {/* HU13: solo se exporta una interconsulta ya revisada. */}
          <select
            aria-label="Formato de exportación"
            className="form-select pz-select--mini"
            value={formato}
            disabled={!estaRevisada}
            onChange={(e) => setFormato(e.target.value as FormatoExportacion)}
          >
            {FORMATOS_EXPORTACION.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.etiqueta}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => exportarInterconsulta(interconsulta, formato, config)}
            disabled={!estaRevisada}
            title={
              estaRevisada
                ? undefined
                : "La interconsulta debe estar revisada para poder exportar"
            }
            className="pz-btn pz-btn--ghost pz-btn--mini"
          >
            Exportar
          </button>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-xl-8">
          <div className="flex flex-col gap-5">
            <DetalleInterconsulta interconsulta={interconsulta} />
            <ResumenClinico pacienteId={interconsulta.pacienteId} />
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="flex flex-col gap-5">
            {esValida && (
              <TarjetaPriorizacionIA
                priorizacion={interconsulta.priorizacionIA}
                prioridadActual={interconsulta.prioridadActual}
                fueModificada={fueModificada}
                prioridadForzadaPorRegla={interconsulta.prioridadForzadaPorRegla}
                terminosBanderaRoja={interconsulta.terminosBanderaRoja}
              />
            )}

            {esValida &&
              (tienePrioridad ? (
                <FormularioModificarPrioridad
                  prioridadActual={interconsulta.prioridadActual}
                  medicoResponsable={usuarioActual.nombre}
                  onModificar={modificarPrioridad}
                />
              ) : (
                <BotonPriorizarIA
                  priorizada={estaPriorizadaPorIA}
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

      <div className="flex justify-center pt-1 pb-2">
        <BotonVolver />
      </div>
    </div>
  );
}

/** Vuelta al listado. Aparece arriba en la barra y de nuevo al pie, para no
 *  obligar a subir todo el scroll cuando la interconsulta es larga. */
function BotonVolver() {
  return (
    <Link href="/interconsultas" className="pz-btn pz-btn--ghost pz-btn--mini">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      Volver al listado
    </Link>
  );
}
