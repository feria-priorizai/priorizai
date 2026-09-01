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
import EstadoVista from "@/components/ui/EstadoVista";
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
        <Link href="/interconsultas" className="pz-btn pz-btn--azul">
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
          <ResumenClinico interconsulta={interconsulta} />
          <TablaEntidades
            entidades={interconsulta.entidades}
            error={interconsulta.entidadesError}
          />
          <HistorialModificaciones
            modificaciones={interconsulta.historialModificaciones}
          />
        </div>
      </div>
    </div>
  );
}
