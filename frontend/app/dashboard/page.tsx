"use client";

/**
 * Panel principal (HdU05): bienvenida, riel de cifras y lista de espera
 * ordenada por el backend según prioridad y fecha de emisión.
 */

import { useInterconsultas } from "@/hooks/useInterconsultas";
import ResumenEstadisticas from "@/components/dashboard/ResumenEstadisticas";
import ColaInterconsultas from "@/components/interconsultas/ColaInterconsultas";
import EstadoVista from "@/components/ui/EstadoVista";
import { usuarioActual } from "@/data/sesion";

export default function DashboardPage() {
  const { interconsultas, cargando, error, totalInterconsultas } =
    useInterconsultas();

  if (cargando) {
    return <EstadoVista tipo="cargando" texto="Cargando interconsultas…" />;
  }

  if (error) {
    return <EstadoVista tipo="error" texto={error} />;
  }

  const pendientes = interconsultas.filter((ic) => ic.estado === "pendiente").length;

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h2
          className="mb-2"
          style={{ fontSize: "var(--fs-xl)", letterSpacing: "-.03em" }}
        >
          Bienvenido a tus interconsultas
        </h2>
        <p className="mb-0" style={{ fontSize: "var(--fs-md)", color: "var(--pz-ink-2)" }}>
          {usuarioActual.nombre.split(" ").slice(0, 2).join(" ")}, hoy tenés{" "}
          <strong style={{ color: "var(--pz-ink)" }}>
            {pendientes} {pendientes === 1 ? "interconsulta" : "interconsultas"}
          </strong>{" "}
          {pendientes === 1 ? "pendiente" : "pendientes"} de revisión.
        </p>
      </header>

      <ResumenEstadisticas
        interconsultas={interconsultas}
        total={totalInterconsultas}
      />

      {/* La descarga multiple vive en el listado, no en el panel. */}
      <ColaInterconsultas
        interconsultas={interconsultas}
        titulo="Interconsultas recientes"
        subtitulo="Agrupadas por prioridad"
        mostrarBotonDescargaMultiple={false}
      />
    </div>
  );
}
