/**
 * Tipos relacionados con las interconsultas medicas.
 * Representan el flujo de priorizacion automatica y manual (HdU01, HdU02).
 */

export type NivelPrioridad = "alta" | "media" | "baja";

export type EstadoInterconsulta = "pendiente" | "revisada";

export interface ResultadoPriorizacion {
  nivelSugerido: NivelPrioridad;
  confianza: number;
  priorizada?: boolean;
  probabilidades?: Record<NivelPrioridad, number>;
  justificacion: string;
}

export interface ModificacionPrioridad {
  id: string;
  prioridadAnterior: NivelPrioridad;
  prioridadNueva: NivelPrioridad;
  motivo: string;
  medicoResponsable: string;
  fecha: string;
}

export interface Interconsulta {
  id: string;
  pacienteId: string;
  pacienteNombre: string;
  pacienteRut: string;
  pacienteEdad: number;
  especialidad: string;
  centroOrigen: string;
  diagnostico: string;
  motivoInterconsulta: string;
  esValidaParaPriorizacion?: boolean;
  estado: EstadoInterconsulta;
  prioridadActual: NivelPrioridad;
  /** true si no hay ninguna prioridad disponible (HU2-c5): ni del medico, ni del
   * modelo, ni del CSV original. prioridadActual queda con un valor de relleno
   * que la interfaz no debe mostrar cuando este flag esta activo. */
  sinPrioridad?: boolean;
  motivoSinPrioridad?: string | null;
  priorizacionIA: ResultadoPriorizacion;
  /** RF7: bandera roja detectada por el catalogo de terminos de alarma. */
  banderaRoja: boolean;
  terminosBanderaRoja: string[];
  /** true si la prioridad actual fue forzada por la regla de banderas rojas y no
   * por el modelo (D7): la interfaz debe mostrar "Regla clinica" en vez de un
   * porcentaje de confianza. */
  prioridadForzadaPorRegla: boolean;
  historialModificaciones: ModificacionPrioridad[];
  fechaIngreso: string;
  fechaEmision: string | null;
  fechaActualizacion: string;

  // Campos crudos del backend (utilizados por el export configurable).
  // Mantener ambos formatos evita perder informacion al exportar.
  especOrigen?: string;
  especDestino?: string;
  sexo?: string;
  edad?: number;
  historiaClinica?: string;
  fundamentosDiagnostico?: string;
  examenesComplementarios?: string | null;
  prioridadOriginalCsv?: string | null;
}
