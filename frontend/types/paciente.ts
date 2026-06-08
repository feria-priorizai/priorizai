/**
 * Tipos relacionados con los datos clínicos de pacientes.
 * Usados para el resumen clínico automático (HdU03).
 */

/** Diagnóstico previo registrado en el historial del paciente */
export interface DiagnosticoPrevio {
  /** Código CIE-10 del diagnóstico */
  codigo: string;
  /** Nombre descriptivo del diagnóstico */
  nombre: string;
  /** Fecha en que fue diagnosticado */
  fecha: string;
  /** Si el diagnóstico sigue activo o fue resuelto */
  activo: boolean;
}

/** Tratamiento que el paciente ha recibido o recibe actualmente */
export interface Tratamiento {
  nombre: string;
  dosis: string;
  frecuencia: string;
  /** Fecha de inicio del tratamiento */
  fechaInicio: string;
  /** Fecha de término, null si está vigente */
  fechaTermino: string | null;
  activo: boolean;
}

/** Alergia conocida del paciente */
export interface Alergia {
  sustancia: string;
  /** Nivel de severidad de la reacción alérgica */
  severidad: "leve" | "moderada" | "severa";
  reaccion: string;
}

/** Atención médica reciente del paciente */
export interface AtencionReciente {
  tipo: string;
  especialidad: string;
  fecha: string;
  resumen: string;
}

/** Resumen clínico completo generado para la vista de detalle (HdU03) */
export interface ResumenClinicoPaciente {
  pacienteId: string;
  nombre: string;
  rut: string;
  edad: number;
  sexo: "M" | "F";
  prevision: string;
  diagnosticosPrevios: DiagnosticoPrevio[];
  tratamientos: Tratamiento[];
  alergias: Alergia[];
  atencionesRecientes: AtencionReciente[];
  /** Factores de riesgo identificados automáticamente */
  factoresRiesgo: string[];
  /** Indica si hay información suficiente para generar el resumen */
  informacionSuficiente: boolean;
}
