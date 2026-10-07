"use client";

/**
 * Panel principal (HdU05): riel de cifras y lista de espera ordenada por el
 * backend según prioridad y fecha de emisión. Sin bienvenida: empujaba la
 * lista hacia abajo sin aportar nada que el riel no diga.
 */

import { useInterconsultas } from "@/hooks/useInterconsultas";
import ResumenEstadisticas from "@/components/dashboard/ResumenEstadisticas";
import ColaInterconsultas from "@/components/interconsultas/ColaInterconsultas";
import EstadoVista from "@/components/ui/EstadoVista";
import { useSesion } from "@/context/SesionContext";
import { useVistaLista } from "@/hooks/useVistaLista";

export default function DashboardPage() {
  const { usuario } = useSesion();
  const { interconsultas, cargando, error, totalInterconsultas } =
    useInterconsultas();
  const [vista, setVista] = useVistaLista();

  if (!usuario) {
    return null; // SesionProvider redirige al login si no hay usuario
  }

  if (cargando) {
    return <EstadoVista tipo="cargando" texto="Cargando interconsultas…" />;
  }

  if (error) {
    return <EstadoVista tipo="error" texto={error} />;
  }

  return (
    // gap-[…] y no gap-5: Bootstrap define .gap-5 (3rem) con !important y gana.
    <div className="flex flex-col gap-[1.25rem]">
      <ResumenEstadisticas
        interconsultas={interconsultas}
        total={totalInterconsultas}
      />

      <ColaInterconsultas
        interconsultas={interconsultas}
        titulo="Interconsultas recientes"
        subtitulo="Agrupadas por prioridad"
        mostrarBotonDescargaMultiple={false}
        vista={vista}
        onCambiarVista={setVista}
      />
    </div>
  );
}
