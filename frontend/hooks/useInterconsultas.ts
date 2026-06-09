"use client";

/**
 * Hook personalizado para gestionar el estado de las interconsultas.
 * Centraliza la lógica de carga, filtrado y modificación de prioridades.
 *
 * Separa la lógica de negocio de la presentación para facilitar
 * la migración futura al backend real.
 */

import { useState, useEffect, useCallback } from "react";
import type { Interconsulta, NivelPrioridad, EstadoInterconsulta } from "@/types";
import {
  obtenerInterconsultas,
  obtenerInterconsultaPorId,
  modificarPrioridad,
  priorizarInterconsulta,
} from "@/services/interconsultas";
import { usuarioActual } from "@/data/mock";

/** Filtros aplicables a la lista de interconsultas */
export interface FiltrosInterconsulta {
  prioridad: NivelPrioridad | "todas";
  estado: EstadoInterconsulta | "todos";
  busqueda: string;
}

/** Estado retornado por el hook */
interface UseInterconsultasReturn {
  interconsultas: Interconsulta[];
  cargando: boolean;
  error: string | null;
  filtros: FiltrosInterconsulta;
  actualizarFiltros: (nuevosFiltros: Partial<FiltrosInterconsulta>) => void;
  cambiarPrioridad: (
    id: string,
    nuevaPrioridad: NivelPrioridad,
    motivo: string
  ) => Promise<boolean>;
  recargar: () => Promise<void>;
}

/** Filtros por defecto al inicializar */
const filtrosIniciales: FiltrosInterconsulta = {
  prioridad: "todas",
  estado: "todos",
  busqueda: "",
};

export function useInterconsultas(): UseInterconsultasReturn {
  const [todasLasInterconsultas, setTodasLasInterconsultas] = useState<
    Interconsulta[]
  >([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosInterconsulta>(filtrosIniciales);

  /** Carga las interconsultas desde el servicio */
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const data = await obtenerInterconsultas();
      setTodasLasInterconsultas(data);
    } catch {
      setError("Error al cargar las interconsultas");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let activo = true;

    obtenerInterconsultas()
      .then((data) => {
        if (activo) {
          setTodasLasInterconsultas(data);
          setError(null);
        }
      })
      .catch(() => {
        if (activo) {
          setError("Error al cargar las interconsultas");
        }
      })
      .finally(() => {
        if (activo) {
          setCargando(false);
        }
      });

    return () => {
      activo = false;
    };
  }, []);

  /** Aplica los filtros activos sobre la lista completa */
  const interconsultasFiltradas = todasLasInterconsultas.filter((ic) => {
    if (filtros.prioridad !== "todas" && ic.prioridadActual !== filtros.prioridad)
      return false;
    if (filtros.estado !== "todos" && ic.estado !== filtros.estado)
      return false;
    if (filtros.busqueda) {
      const termino = filtros.busqueda.toLowerCase();
      return (
        ic.pacienteNombre.toLowerCase().includes(termino) ||
        ic.pacienteRut.includes(termino) ||
        ic.diagnostico.toLowerCase().includes(termino)
      );
    }
    return true;
  });

  /** Actualiza los filtros de forma parcial */
  const actualizarFiltros = (nuevosFiltros: Partial<FiltrosInterconsulta>) => {
    setFiltros((prev) => ({ ...prev, ...nuevosFiltros }));
  };

  /** Modifica la prioridad de una interconsulta (HdU02) */
  const cambiarPrioridad = async (
    id: string,
    nuevaPrioridad: NivelPrioridad,
    motivo: string
  ): Promise<boolean> => {
    try {
      const actualizada = await modificarPrioridad(
        id,
        nuevaPrioridad,
        motivo,
        usuarioActual.nombre
      );
      setTodasLasInterconsultas((prev) =>
        prev.map((ic) => (ic.id === actualizada.id ? actualizada : ic))
      );
      return true;
    } catch {
      setError("Error al modificar la prioridad");
      return false;
    }
  };

  return {
    interconsultas: interconsultasFiltradas,
    cargando,
    error,
    filtros,
    actualizarFiltros,
    cambiarPrioridad,
    recargar: cargar,
  };
}

/** Hook para obtener una interconsulta individual por ID */
export function useInterconsultaDetalle(id: string) {
  const [interconsulta, setInterconsulta] = useState<Interconsulta | null>(null);
  const [estadoCarga, setEstadoCarga] = useState({ id, cargando: true });
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstadoCarga({ id, cargando: true });
    setError(null);
    try {
      const data = await obtenerInterconsultaPorId(id);
      setInterconsulta(data);
      if (!data) setError("Interconsulta no encontrada");
    } catch {
      setError("Error al cargar la interconsulta");
    } finally {
      setEstadoCarga({ id, cargando: false });
    }
  }, [id]);

  useEffect(() => {
    let activo = true;

    obtenerInterconsultaPorId(id)
      .then((data) => {
        if (activo) {
          setInterconsulta(data);
          setError(data ? null : "Interconsulta no encontrada");
        }
      })
      .catch(() => {
        if (activo) {
          setError("Error al cargar la interconsulta");
        }
      })
      .finally(() => {
        if (activo) {
          setEstadoCarga({ id, cargando: false });
        }
      });

    return () => {
      activo = false;
    };
  }, [id]);

  /** Actualiza la prioridad y refresca el estado local */
  const cambiarPrioridad = async (
    nuevaPrioridad: NivelPrioridad,
    motivo: string
  ): Promise<boolean> => {
    try {
      const actualizada = await modificarPrioridad(
        id,
        nuevaPrioridad,
        motivo,
        usuarioActual.nombre
      );
      setInterconsulta(actualizada);
      return true;
    } catch {
      setError("Error al modificar la prioridad");
      return false;
    }
  };

  const cargando = estadoCarga.id !== id || estadoCarga.cargando;

  const priorizarConIA = async (): Promise<boolean> => {
    try {
      const actualizada = await priorizarInterconsulta(id);
      setInterconsulta(actualizada);
      setError(null);
      return true;
    } catch {
      setError("Error al ejecutar la priorizacion con IA");
      return false;
    }
  };

  return {
    interconsulta,
    cargando,
    error,
    cambiarPrioridad,
    priorizarConIA,
    recargar: cargar,
  };
}
