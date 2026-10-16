import type { Interconsulta } from "@/types";

/** Interconsulta sintética con valores por defecto razonables. */
export function crearInterconsulta(parcial: Partial<Interconsulta> = {}): Interconsulta {
  return {
    id: "a1b2c3d4-0000-0000-0000-000000000001",
    pacienteId: "a1b2c3d4-0000-0000-0000-000000000001",
    pacienteEdad: 54,
    especialidad: "Cardiología",
    centroOrigen: "Medicina General",
    diagnostico: "Dolor torácico opresivo",
    motivoInterconsulta: "Evaluación cardiológica",
    esValidaParaPriorizacion: true,
    estado: "pendiente",
    prioridadActual: "media",
    sinPrioridad: false,
    priorizacionIA: {
      nivelSugerido: "media",
      confianza: 72,
      priorizada: true,
      probabilidades: { baja: 0.1, media: 0.72, alta: 0.18 },
      justificacion: "Sugerida por el modelo",
    },
    banderaRoja: false,
    terminosBanderaRoja: [],
    prioridadForzadaPorRegla: false,
    historialModificaciones: [],
    fechaIngreso: "2026-10-01T12:00:00",
    fechaEmision: "2026-09-30",
    fechaActualizacion: "2026-10-01T12:00:00",
    especOrigen: "Medicina General",
    especDestino: "Cardiología",
    sexo: "Masculino",
    edad: 54,
    historiaClinica: "Dolor torácico opresivo",
    fundamentosDiagnostico: "Sospecha de angina",
    examenesComplementarios: null,
    prioridadOriginalCsv: null,
    ...parcial,
  };
}

/** Respuesta de fetch con cuerpo JSON. */
export function respuestaJson(
  cuerpo: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}
