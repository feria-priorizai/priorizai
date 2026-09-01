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
import { usuarioActual } from "@/data/sesion";

export interface FiltrosInterconsulta {
  /** "sin" busca las que no tienen ninguna prioridad asignada. */
  prioridad: NivelPrioridad | "sin" | "todas";
  estado: EstadoInterconsulta | "todos";
  busqueda: string;
}

interface UseInterconsultasReturn {
  interconsultas: Interconsulta[];
  cargando: boolean;
  error: string | null;
  totalInterconsultas: number;
  /** true si el servidor tiene mas de las que se alcanzaron a cargar. */
  listadoTruncado: boolean;
  pendientesPriorizables: number;
  pendientesInvalidas: number;
  filtros: FiltrosInterconsulta;
  actualizarFiltros: (nuevosFiltros: Partial<FiltrosInterconsulta>) => void;
  limpiarFiltros: () => void;
  hayFiltrosActivos: boolean;
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
  /** Total en el servidor, que puede ser mayor que lo cargado. */
  total: number;
  truncado: boolean;
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

/**
 * Avisa al resto de la app (listado, dashboard) que hay datos frescos.
 *
 * Con `actualizada` el listado reemplaza solo esa fila. Sin ella recarga
 * todo, que hoy son tantas peticiones como páginas tenga la lista: eso se
 * reserva para las cargas de archivo, donde sí cambió el conjunto entero.
 */
function notificarActualizacion(actualizada?: Interconsulta): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(EVENTO_INTERCONSULTAS_ACTUALIZADAS, {
        detail: actualizada ?? null,
      }),
    );
  }
}

export function useInterconsultas(): UseInterconsultasReturn {
  const [estado, setEstado] = useState<EstadoListado>({
    interconsultas: [],
    cargando: true,
    error: null,
    total: 0,
    truncado: false,
  });
  const [filtros, setFiltros] = useState<FiltrosInterconsulta>(filtrosIniciales);

  const recargar = useCallback(async () => {
    setEstado((prev) => ({ ...prev, cargando: true, error: null }));
    try {
      const listado = await obtenerInterconsultas();
      setEstado({
        interconsultas: listado.interconsultas,
        cargando: false,
        error: null,
        total: listado.total,
        truncado: listado.truncado,
      });
    } catch {
      setEstado({
        interconsultas: [],
        cargando: false,
        error: "Error al cargar las interconsultas",
        total: 0,
        truncado: false,
      });
    }
  }, []);

  useEffect(() => {
    let activo = true;
    const control = new AbortController();

    void obtenerInterconsultas(control.signal)
      .then((listado) => {
        if (activo) {
          setEstado({
            interconsultas: listado.interconsultas,
            cargando: false,
            error: null,
            total: listado.total,
            truncado: listado.truncado,
          });
        }
      })
      .catch(() => {
        if (activo) {
          setEstado({
            interconsultas: [],
            cargando: false,
            error: "Error al cargar las interconsultas",
            total: 0,
            truncado: false,
          });
        }
      });

    return () => {
      activo = false;
      control.abort();
    };
  }, []);

  useEffect(() => {
    const manejarActualizacion = (evento: Event) => {
      const actualizada = (evento as CustomEvent<Interconsulta | null>)
        .detail;
      if (actualizada) {
        setEstado((prev) => ({
          ...prev,
          interconsultas: prev.interconsultas.map((ic) =>
            ic.id === actualizada.id ? actualizada : ic,
          ),
        }));
        return;
      }
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
    // sinPrioridad rellena prioridadActual con "baja" para satisfacer el tipo,
    // asi que filtrar por nivel debe descartarlas explicitamente o se cuelan
    // todas en el filtro "Baja".
    if (filtros.prioridad === "sin") {
      if (!ic.sinPrioridad) {
        return false;
      }
    } else if (filtros.prioridad !== "todas") {
      if (ic.sinPrioridad || ic.prioridadActual !== filtros.prioridad) {
        return false;
      }
    }
    if (filtros.estado !== "todos" && ic.estado !== filtros.estado) {
      return false;
    }
    if (!filtros.busqueda) {
      return true;
    }

    const termino = filtros.busqueda.toLowerCase();
    return (
      ic.id.toLowerCase().includes(termino) ||
      ic.diagnostico.toLowerCase().includes(termino) ||
      ic.especialidad.toLowerCase().includes(termino) ||
      ic.motivoInterconsulta.toLowerCase().includes(termino)
    );
  });

  const actualizarFiltros = (nuevosFiltros: Partial<FiltrosInterconsulta>) => {
    setFiltros((prev) => ({ ...prev, ...nuevosFiltros }));
  };

  const limpiarFiltros = () => setFiltros(filtrosIniciales);

  const hayFiltrosActivos =
    filtros.prioridad !== "todas" ||
    filtros.estado !== "todos" ||
    filtros.busqueda.trim() !== "";

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
      notificarActualizacion(actualizada);
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
    totalInterconsultas: estado.total,
    listadoTruncado: estado.truncado,
    pendientesPriorizables,
    pendientesInvalidas,
    filtros,
    actualizarFiltros,
    limpiarFiltros,
    hayFiltrosActivos,
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
      notificarActualizacion(actualizada);
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
      notificarActualizacion(actualizada);
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
      notificarActualizacion(actualizada);
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
