"use client";

import { useState, useCallback, useEffect } from "react";
import { useInterconsultas } from "@/hooks/useInterconsultas";
import FiltrosInterconsultas from "@/components/interconsultas/FiltrosInterconsultas";
import ColaInterconsultas from "@/components/interconsultas/ColaInterconsultas";
import { useConfiguracionExport } from "@/hooks/useConfiguracionCampos";
import { exportarInterconsultas } from "@/utils/exportUtils";
import EstadoVista from "@/components/ui/EstadoVista";

export default function InterconsultasPage() {
  const {
    interconsultas,
    cargando,
    error,
    totalInterconsultas,
    filtros,
    actualizarFiltros,
    limpiarFiltros,
    hayFiltrosActivos,
  } = useInterconsultas();
  const { config } = useConfiguracionExport();

  const [modoDescargaMultiple, setModoDescargaMultiple] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [filtrosPrevios, setFiltrosPrevios] = useState<{ estado: string; prioridad: string; busqueda: string } | null>(null);
  const [formatoDescarga, setFormatoDescarga] = useState<"json" | "csv" | "xlsx">("csv");

  // Cuando se activa el modo descarga múltiple, bloquear filtro a "revisada"
  // y guardar los filtros previos para restaurarlos al cancelar
  const activarDescargaMultiple = useCallback(() => {
    setFiltrosPrevios({
      estado: filtros.estado,
      prioridad: filtros.prioridad,
      busqueda: filtros.busqueda,
    });
    actualizarFiltros({ estado: "revisada" });
    setModoDescargaMultiple(true);
    setSeleccionadas(new Set());
  }, [filtros, actualizarFiltros]);

  const cancelarDescargaMultiple = useCallback(() => {
    setModoDescargaMultiple(false);
    setSeleccionadas(new Set());
    if (filtrosPrevios) {
      actualizarFiltros({
        estado: filtrosPrevios.estado as typeof filtros.estado,
        prioridad: filtrosPrevios.prioridad as typeof filtros.prioridad,
        busqueda: filtrosPrevios.busqueda,
      });
      setFiltrosPrevios(null);
    }
  }, [filtrosPrevios, actualizarFiltros]);

  const toggleSeleccionarTodas = useCallback(() => {
    if (seleccionadas.size === interconsultas.length && interconsultas.length > 0) {
      setSeleccionadas(new Set());
    } else {
      setSeleccionadas(new Set(interconsultas.map((ic) => ic.id)));
    }
  }, [seleccionadas, interconsultas]);

  const manejarCambiarSeleccion = useCallback((nuevas: Set<string>) => {
    setSeleccionadas(nuevas);
  }, []);

  const manejarDescargarSeleccion = useCallback(() => {
    if (seleccionadas.size === 0) return;
    const seleccionadasArray = interconsultas.filter((ic) => seleccionadas.has(ic.id));
    exportarInterconsultas(seleccionadasArray, formatoDescarga, config);
    // Opcional: cancelar modo tras descargar
    cancelarDescargaMultiple();
  }, [seleccionadas, interconsultas, config, cancelarDescargaMultiple, formatoDescarga]);

  // Si estamos en modo descarga múltiple y cambian los filtros (por código),
  // forzar estado a "revisada"
  useEffect(() => {
    if (modoDescargaMultiple && filtros.estado !== "revisada") {
      actualizarFiltros({ estado: "revisada" });
    }
  }, [modoDescargaMultiple, filtros.estado, actualizarFiltros]);

  if (cargando) {
    return <EstadoVista tipo="cargando" texto="Cargando interconsultas…" />;
  }

  if (error) {
    return <EstadoVista tipo="error" texto={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <FiltrosInterconsultas
        filtros={filtros}
        onCambiarFiltros={actualizarFiltros}
        deshabilitado={modoDescargaMultiple}
        hayFiltrosActivos={hayFiltrosActivos}
        onLimpiar={limpiarFiltros}
        visibles={interconsultas.length}
        total={totalInterconsultas}
      />

      <ColaInterconsultas
        interconsultas={interconsultas}
        titulo="Lista de espera"
        modoDescargaMultiple={modoDescargaMultiple}
        seleccionadas={seleccionadas}
        onCambiarSeleccion={manejarCambiarSeleccion}
        onToggleSeleccionarTodas={toggleSeleccionarTodas}
        onDescargarSeleccion={manejarDescargarSeleccion}
        onCancelarDescargaMultiple={cancelarDescargaMultiple}
        onActivarDescargaMultiple={activarDescargaMultiple}
        formatoDescarga={formatoDescarga}
        onCambiarFormatoDescarga={setFormatoDescarga}
      />

      <p className="pz-label">
        {modoDescargaMultiple
          ? `Descarga múltiple · ${seleccionadas.size} de ${interconsultas.length} seleccionadas · solo revisadas`
          : `Mostrando ${interconsultas.length} de ${totalInterconsultas} interconsulta${totalInterconsultas !== 1 ? "s" : ""}`}
      </p>
    </div>
  );
}
