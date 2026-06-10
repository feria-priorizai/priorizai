"use client";

import { useCallback, useEffect, useState } from "react";
import type { EstadoInterconsulta, Interconsulta, NivelPrioridad } from "@/types";
import {
  EVENTO_INTERCONSULTAS_ACTUALIZADAS,
  modificarEstadoInterconsulta,
  modificarPrioridad,
  obtenerInterconsultaPorId,
  obtenerInterconsultas,
  priorizarInterconsulta,
} from "@/services/interconsultas";
import { usuarioActual } from "@/data/mock";

export interface FiltrosInterconsulta {
  prioridad: NivelPrioridad | "todas";
  estado: EstadoInterconsulta | "todos";
  busqueda: string;
}

interface UseInterconsultasReturn {
  interconsultas: Interconsulta[];
  cargando: boolean;
  error: string | null;
  totalInterconsultas: number;
  pendientesPriorizables: number;
  pendientesInvalidas: number;
  filtros: FiltrosInterconsulta;
  actualizarFiltros: (nuevosFiltros: Partial<FiltrosInterconsulta>) => void;
  cambiarPrioridad: (
    id: string,
    nuevaPrioridad: NivelPrioridad,
    motivo: string,
  ) => Promise<boolean>;
  recargar: () => Promise<void>;
}

interface EstadoListado {
  interconsultas: Interconsulta[];
  cargando: boolean;
  error: string | null;
}

interface EstadoDetalle {
  id: string;
  interconsulta: Interconsulta | null;
  error: string | null;
}

const filtrosIniciales: FiltrosInterconsulta = {
  prioridad: "todas",
  estado: "todos",
  busqueda: "",
};

export function useInterconsultas(): UseInterconsultasReturn {
  const [estado, setEstado] = useState<EstadoListado>({
    interconsultas: [],
    cargando: true,
    error: null,
  });
  const [filtros, setFiltros] = useState<FiltrosInterconsulta>(filtrosIniciales);

  const recargar = useCallback(async () => {
    setEstado((prev) => ({ ...prev, cargando: true, error: null }));
    try {
      const data = await obtenerInterconsultas();
      setEstado({ interconsultas: data, cargando: false, error: null });
    } catch {
      setEstado({
        interconsultas: [],
        cargando: false,
        error: "Error al cargar las interconsultas",
      });
    }
  }, []);

  useEffect(() => {
    let activo = true;

    void obtenerInterconsultas()
      .then((data) => {
        if (activo) {
          setEstado({ interconsultas: data, cargando: false, error: null });
        }
      })
      .catch(() => {
        if (activo) {
          setEstado({
            interconsultas: [],
            cargando: false,
            error: "Error al cargar las interconsultas",
          });
        }
      });

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    const manejarActualizacion = () => {
      void recargar();
    };

    window.addEventListener(
      EVENTO_INTERCONSULTAS_ACTUALIZADAS,
      manejarActualizacion,
    );

    return () => {
      window.removeEventListener(
        EVENTO_INTERCONSULTAS_ACTUALIZADAS,
        manejarActualizacion,
      );
    };
  }, [recargar]);

  const interconsultasFiltradas = estado.interconsultas.filter((ic) => {
    if (filtros.prioridad !== "todas" && ic.prioridadActual !== filtros.prioridad) {
      return false;
    }
    if (filtros.estado !== "todos" && ic.estado !== filtros.estado) {
      return false;
    }
    if (!filtros.busqueda) {
      return true;
    }

    const termino = filtros.busqueda.toLowerCase();
    return (
      ic.pacienteNombre.toLowerCase().includes(termino) ||
      ic.pacienteRut.includes(termino) ||
      ic.diagnostico.toLowerCase().includes(termino)
    );
  });

  const actualizarFiltros = (nuevosFiltros: Partial<FiltrosInterconsulta>) => {
    setFiltros((prev) => ({ ...prev, ...nuevosFiltros }));
  };

  const pendientesPriorizables = estado.interconsultas.filter(
    (ic) =>
      ic.priorizacionIA.priorizada !== true &&
      ic.esValidaParaPriorizacion !== false,
  ).length;
  const pendientesInvalidas = estado.interconsultas.filter(
    (ic) =>
      ic.priorizacionIA.priorizada !== true &&
      ic.esValidaParaPriorizacion === false,
  ).length;

  const cambiarPrioridad = async (
    id: string,
    nuevaPrioridad: NivelPrioridad,
    motivo: string,
  ): Promise<boolean> => {
    try {
      const actualizada = await modificarPrioridad(
        id,
        nuevaPrioridad,
        motivo,
        usuarioActual.nombre,
      );
      setEstado((prev) => ({
        ...prev,
        interconsultas: prev.interconsultas.map((ic) =>
          ic.id === actualizada.id ? actualizada : ic,
        ),
      }));
      return true;
    } catch {
      setEstado((prev) => ({
        ...prev,
        error: "Error al modificar la prioridad",
      }));
      return false;
    }
  };

  return {
    interconsultas: interconsultasFiltradas,
    cargando: estado.cargando,
    error: estado.error,
    totalInterconsultas: estado.interconsultas.length,
    pendientesPriorizables,
    pendientesInvalidas,
    filtros,
    actualizarFiltros,
    cambiarPrioridad,
    recargar,
  };
}

export function useInterconsultaDetalle(id: string) {
  const [estado, setEstado] = useState<EstadoDetalle>({
    id,
    interconsulta: null,
    error: null,
  });

  useEffect(() => {
    let activo = true;

    void obtenerInterconsultaPorId(id)
      .then((data) => {
        if (!activo) {
          return;
        }

        setEstado({
          id,
          interconsulta: data,
          error: data ? null : "Interconsulta no encontrada",
        });
      })
      .catch(() => {
        if (activo) {
          setEstado({
            id,
            interconsulta: null,
            error: "Error al cargar la interconsulta",
          });
        }
      });

    return () => {
      activo = false;
    };
  }, [id]);

  const recargar = useCallback(async () => {
    try {
      const data = await obtenerInterconsultaPorId(id);
      setEstado({
        id,
        interconsulta: data,
        error: data ? null : "Interconsulta no encontrada",
      });
    } catch {
      setEstado({
        id,
        interconsulta: null,
        error: "Error al cargar la interconsulta",
      });
    }
  }, [id]);

  const cambiarPrioridad = async (
    nuevaPrioridad: NivelPrioridad,
    motivo: string,
  ): Promise<boolean> => {
    try {
      const actualizada = await modificarPrioridad(
        id,
        nuevaPrioridad,
        motivo,
        usuarioActual.nombre,
      );
      setEstado({ id, interconsulta: actualizada, error: null });
      return true;
    } catch {
      setEstado((prev) => ({
        ...prev,
        error: "Error al modificar la prioridad",
      }));
      return false;
    }
  };

  const priorizarConIA = async (): Promise<boolean> => {
    try {
      const actualizada = await priorizarInterconsulta(id);
      setEstado({ id, interconsulta: actualizada, error: null });
      return true;
    } catch (error) {
      setEstado((prev) => ({
        ...prev,
        error:
          error instanceof Error
            ? error.message
            : "Error al ejecutar la priorizacion con IA",
      }));
      return false;
    }
  };

  const cambiarEstado = async (
    nuevoEstado: EstadoInterconsulta,
  ): Promise<boolean> => {
    try {
      const actualizada = await modificarEstadoInterconsulta(id, nuevoEstado);
      setEstado({ id, interconsulta: actualizada, error: null });
      return true;
    } catch {
      setEstado((prev) => ({
        ...prev,
        error: "Error al actualizar el estado",
      }));
      return false;
    }
  };

  const cargando =
    estado.id !== id || (estado.interconsulta === null && estado.error === null);

  return {
    interconsulta: estado.id === id ? estado.interconsulta : null,
    cargando,
    error: estado.id === id ? estado.error : null,
    cambiarPrioridad,
    priorizarConIA,
    cambiarEstado,
    recargar,
  };
}
