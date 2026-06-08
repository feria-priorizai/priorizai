/**
 * Tipos relacionados con las interconsultas médicas.
 * Representan el flujo de priorización automática y manual (HdU01, HdU02).
 */

/** Niveles de prioridad clínica asignados a cada interconsulta */
export type NivelPrioridad = "alta" | "media" | "baja";

/** Estados posibles de una interconsulta dentro del flujo */
export type EstadoInterconsulta =
  | "pendiente"
  | "revisada"
  | "derivada"
  | "agendada";

/** Resultado de la priorización automática realizada por el modelo de IA */
export interface ResultadoPriorizacion {
  /** Nivel de prioridad asignado por el modelo */
  nivelSugerido: NivelPrioridad;
  /** Porcentaje de certeza del modelo (0-100) */
  confianza: number;
  /** Justificación textual generada por el modelo */
  justificacion: string;
}

/** Registro de cada modificación manual hecha por un médico (HdU02) */
export interface ModificacionPrioridad {
  id: string;
  /** Prioridad antes del cambio */
  prioridadAnterior: NivelPrioridad;
  /** Prioridad después del cambio */
  prioridadNueva: NivelPrioridad;
  /** Motivo ingresado por el médico */
  motivo: string;
  /** Nombre del médico que realizó la modificación */
  medicoResponsable: string;
  /** Fecha y hora de la modificación */
  fecha: string;
}

/** Modelo principal de una interconsulta en el sistema */
export interface Interconsulta {
  id: string;
  /** Identificador del paciente asociado */
  pacienteId: string;
  /** Nombre completo del paciente (para mostrar en listados) */
  pacienteNombre: string;
  /** RUT del paciente */
  pacienteRut: string;
  /** Edad del paciente */
  pacienteEdad: number;
  /** Especialidad médica a la que se deriva */
  especialidad: string;
  /** Centro de salud de origen */
  centroOrigen: string;
  /** Diagnóstico o motivo de la derivación */
  diagnostico: string;
  /** Descripción detallada del motivo de interconsulta */
  motivoInterconsulta: string;
  /** Estado actual dentro del flujo */
  estado: EstadoInterconsulta;
  /** Prioridad vigente (puede diferir de la sugerida si fue modificada) */
  prioridadActual: NivelPrioridad;
  /** Resultado de la priorización automática del modelo */
  priorizacionIA: ResultadoPriorizacion;
  /** Historial de modificaciones manuales realizadas */
  historialModificaciones: ModificacionPrioridad[];
  /** Fecha de ingreso de la interconsulta al sistema */
  fechaIngreso: string;
  /** Fecha de última actualización */
  fechaActualizacion: string;
}
