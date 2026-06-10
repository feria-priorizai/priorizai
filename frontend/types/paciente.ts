export interface DiagnosticoPrevio {
  codigo: string;
  nombre: string;
  fecha: string;
  activo: boolean;
}

export interface Tratamiento {
  nombre: string;
  dosis: string;
  frecuencia: string;
  fechaInicio: string;
  fechaTermino: string | null;
  activo: boolean;
}

export interface Alergia {
  sustancia: string;
  severidad: "leve" | "moderada" | "severa";
  reaccion: string;
}

export interface AtencionReciente {
  tipo: string;
  especialidad: string;
  fecha: string;
  resumen: string;
}

export interface CamposInterconsultaClinica {
  historiaClinica: string;
  fundamentosDiagnostico: string;
  examenesComplementarios: string;
  motivoInterconsulta: string;
}

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
  factoresRiesgo: string[];
  informacionSuficiente: boolean;
  camposInterconsulta?: CamposInterconsultaClinica;
}
