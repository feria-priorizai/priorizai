import type { ExplicacionShap } from "./explicacion";

/**
 * Tipos relacionados con las interconsultas medicas.
 * Representan el flujo de priorizacion automatica y manual (HdU01, HdU02).
 */

export type NivelPrioridad = "alta" | "media" | "baja";

export type EstadoInterconsulta = "pendiente" | "revisada";

/** Días máximos de revisión de cada prioridad (HDU-22). */
export type PlazosRevision = Record<NivelPrioridad, number>;

export interface ResultadoPriorizacion {
  nivelSugerido: NivelPrioridad;
  confianza: number;
  priorizada?: boolean;
  probabilidades?: Record<NivelPrioridad, number>;
  justificacion: string;
}

/** Clases que devuelve el NER, ya traducidas por el backend. */
export type ClaseEntidad = "Enfermedad" | "Farmaco" | "Sigla" | "Sintoma";

/** Entidad clinica detectada. `inicio`/`fin` son offsets sobre el texto
 *  original del campo, asi que texto.slice(inicio, fin) la reconstruye. */
export interface EntidadClinica {
  clase: ClaseEntidad;
  clase_original: string;
  texto: string;
  inicio: number;
  fin: number;
  score: number;
}

/** Entidades agrupadas por campo clinico de la interconsulta. */
export type EntidadesPorCampo = Partial<
  Record<
    | "historia_clinica"
    | "fundamentos_diagnostico"
    | "examenes_complementarios"
    | "motivo_interconsulta",
    EntidadClinica[]
  >
>;

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
  pacienteEdad: number;
  especialidad: string;
  centroOrigen: string;
  diagnostico: string;
  motivoInterconsulta: string;
  esValidaParaPriorizacion?: boolean;
  estado: EstadoInterconsulta;
  prioridadActual: NivelPrioridad;
  sinPrioridad?: boolean;
  motivoSinPrioridad?: string | null;
  priorizacionIA: ResultadoPriorizacion;
  banderaRoja: boolean;
  terminosBanderaRoja: string[];
  prioridadForzadaPorRegla: boolean;
  /** Pendiente que superó el plazo de revisión de su prioridad (HDU-22). */
  atrasada: boolean;
  /** Días por sobre ese plazo; null si no está atrasada. */
  diasAtraso: number | null;
  historialModificaciones: ModificacionPrioridad[];
  fechaIngreso: string;
  fechaEmision: string | null;
  fechaActualizacion: string;

  especOrigen?: string;
  especDestino?: string;
  sexo?: string;
  edad?: number;
  historiaClinica?: string;
  fundamentosDiagnostico?: string;
  examenesComplementarios?: string | null;
  prioridadOriginalCsv?: string | null;

  entidades?: EntidadesPorCampo | null;
  entidadesError?: string | null;

  /** Motivo tal como llegó, sin el texto de reemplazo de `motivoInterconsulta`:
   *  las palabras de la explicación se ubican sobre este. */
  motivoOriginal?: string;
  /** Solo viene en el detalle; el listado no la trae. */
  explicacion?: ExplicacionShap | null;
}
