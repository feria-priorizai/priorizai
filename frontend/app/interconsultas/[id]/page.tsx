"use client";

import { use, useState } from "react";
import Link from "next/link";
import type { Interconsulta, NivelPrioridad } from "@/types";
import { useInterconsultaDetalle } from "@/hooks/useInterconsultas";
import { usuarioActual } from "@/data/sesion";
import DetalleInterconsulta from "@/components/interconsultas/DetalleInterconsulta";
import TarjetaPriorizacionIA from "@/components/interconsultas/TarjetaPriorizacionIA";
import BotonPriorizarIA from "@/components/interconsultas/BotonPriorizarIA";
import FormularioModificarPrioridad from "@/components/interconsultas/FormularioModificarPrioridad";
import HistorialModificaciones from "@/components/interconsultas/HistorialModificaciones";
import ResumenClinico from "@/components/interconsultas/ResumenClinico";
import EstadoVista from "@/components/ui/EstadoVista";

interface PageProps {
  params: Promise<{ id: string }>;
}

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
  const [actualizandoEstado, setActualizandoEstado] = useState(false);

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

  const esValida = interconsulta.esValidaParaPriorizacion ?? true;
  // HU2-c1 exige que la interconsulta este "priorizada por el sistema", no que
  // haya corrido el modelo: una prioridad forzada por la regla de banderas rojas
  // tambien es del sistema, y es justo el caso donde el medico mas necesita
  // poder corregirla. La senal correcta es tener prioridad, no tener sugerencia.
  const tienePrioridad = !interconsulta.sinPrioridad;
  const estaPriorizadaPorIA = interconsulta.priorizacionIA.priorizada ?? true;
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
      <Link
        href="/interconsultas"
        className="pz-eyebrow pz-eyebrow--muted hover:text-[var(--pz-blue-deep)]"
      >
        Volver al listado
      </Link>

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

            <div className="pz-panel">
              <div className="pz-panel__body flex flex-col gap-2.5">
                {interconsulta.estado === "pendiente" && (
                  <button
                    type="button"
                    onClick={marcarComoRevisada}
                    disabled={actualizandoEstado}
                    className="pz-btn pz-btn--solid pz-btn--block"
                  >
                    {actualizandoEstado ? "Actualizando…" : "Marcar como revisada"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => descargarInterconsultaJson(interconsulta)}
                  className="pz-btn pz-btn--ghost pz-btn--block"
                >
                  Exportar JSON
                </button>
              </div>
            </div>

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
