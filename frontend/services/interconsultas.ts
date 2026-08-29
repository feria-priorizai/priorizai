import type {
  EstadoInterconsulta,
  Interconsulta,
  NivelPrioridad,
} from "@/types/interconsulta";
import type { ResumenClinicoPaciente } from "@/types/paciente";
import { resumenesClinicosMock } from "@/data/mock";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

export const EVENTO_INTERCONSULTAS_ACTUALIZADAS =
  "priorizai:interconsultas-actualizadas";

type PrioridadApi = string | null | undefined;

interface InterconsultaApi {
  id: string;
  espec_origen: string;
  edad: number;
  sexo: string;
  espec_destino: string;
  prioridad_original_csv: string | null;
  historia_clinica: string;
  fundamentos_diagnostico: string;
  examenes_complementarios: string | null;
  motivo_interconsulta: string;
  prioridad_sugerida_modelo: string | null;
  confianza_modelo: number | null;
  prob_baja: number | null;
  prob_media: number | null;
  prob_alta: number | null;
  prioridad_actual: string | null;
  estado: string;
  motivo_sin_prioridad: string | null;
  fecha_emision: string | null;
  bandera_roja: boolean;
  terminos_bandera_roja: string | null;
  /** Los mismos terminos con su nombre clinico, resueltos por el backend contra
   * el catalogo. Es lo que se muestra; el campo anterior son los ids. */
  terminos_bandera_roja_nombres: string[];
  prioridad_forzada_por_regla: boolean;
  created_at: string;
  updated_at: string;
  modificaciones?: ModificacionPrioridadApi[];
}

interface ModificacionPrioridadApi {
  id: string;
  prioridad_anterior: string | null;
  prioridad_nueva: string;
  motivo: string;
  medico_responsable: string;
  created_at: string;
}

interface PriorizarResponse {
  total: number;
  resultados: Array<{
    id: string;
    prioridad: NivelPrioridad;
    confianza: number;
    probabilidades: Record<NivelPrioridad, number>;
  }>;
}

/** Obtiene interconsultas reales desde el backend. */
export async function obtenerInterconsultas(): Promise<Interconsulta[]> {
  const respuesta = await fetch(`${API_BASE}/api/interconsultas?limit=100`, {
    cache: "no-store",
  });
  if (!respuesta.ok) {
    throw new Error("Error al cargar las interconsultas");
  }

  const data = (await respuesta.json()) as InterconsultaApi[];
  return data.map(mapearInterconsulta);
}

/** Obtiene una interconsulta real por ID. */
export async function obtenerInterconsultaPorId(
  id: string
): Promise<Interconsulta | null> {
  const respuesta = await fetch(`${API_BASE}/api/interconsultas/${id}`, {
    cache: "no-store",
  });
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) {
    throw new Error("Error al cargar la interconsulta");
  }

  const data = (await respuesta.json()) as InterconsultaApi;
  return mapearInterconsulta(data);
}

/** Ejecuta el modelo predictivo para una sola interconsulta. */
export async function priorizarInterconsulta(id: string): Promise<Interconsulta> {
  const respuesta = await fetch(`${API_BASE}/api/interconsultas/priorizar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [id] }),
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(
      obtenerMensajeError(error?.detail, "No se pudo ejecutar la priorizacion con IA")
    );
  }

  const resultado = (await respuesta.json()) as PriorizarResponse;
  if (resultado.total !== 1) {
    throw new Error("La priorizacion no retorno el resultado esperado");
  }

  const actualizada = await obtenerInterconsultaPorId(id);
  if (!actualizada) {
    throw new Error("Interconsulta no encontrada despues de priorizar");
  }
  return actualizada;
}

/** Ejecuta el modelo para un lote de interconsultas pendientes. */
export async function priorizarInterconsultasPendientes(
  limit: number = 25
): Promise<PriorizarResponse> {
  const respuesta = await fetch(
    `${API_BASE}/api/interconsultas/priorizar-pendientes?limit=${limit}`,
    {
      method: "POST",
    }
  );

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(
      obtenerMensajeError(
        error?.detail,
        "No se pudo priorizar el lote de interconsultas"
      )
    );
  }

  return (await respuesta.json()) as PriorizarResponse;
}

/** Construye un resumen clinico con los campos reales disponibles de la IC. */
export async function obtenerResumenClinico(
  pacienteId: string
): Promise<ResumenClinicoPaciente | null> {
  const interconsulta = await obtenerInterconsultaApiPorId(pacienteId);
  if (!interconsulta) {
    return resumenesClinicosMock[pacienteId] ?? null;
  }

  const tieneInformacion = [
    interconsulta.historia_clinica,
    interconsulta.fundamentos_diagnostico,
    interconsulta.examenes_complementarios,
    interconsulta.motivo_interconsulta,
  ].some((campo) => Boolean(campo?.trim()));

  return {
    pacienteId: interconsulta.id,
    nombre: `Paciente ${interconsulta.id.slice(0, 8)}`,
    rut: "XX.XXX.XXX-X",
    edad: interconsulta.edad,
    sexo: normalizarSexo(interconsulta.sexo),
    prevision: "No disponible",
    diagnosticosPrevios: interconsulta.historia_clinica
      ? [
          {
            codigo: "N/D",
            nombre: interconsulta.historia_clinica,
            fecha: interconsulta.created_at,
            activo: true,
          },
        ]
      : [],
    tratamientos: [],
    alergias: [],
    atencionesRecientes: [
      {
        tipo: "Interconsulta",
        especialidad: interconsulta.espec_destino,
        fecha: interconsulta.created_at,
        resumen: construirResumenCamposClinicos(interconsulta),
      },
    ],
    factoresRiesgo: [],
    informacionSuficiente: tieneInformacion,
    camposInterconsulta: {
      historiaClinica: interconsulta.historia_clinica,
      fundamentosDiagnostico: interconsulta.fundamentos_diagnostico,
      examenesComplementarios: interconsulta.examenes_complementarios ?? "",
      motivoInterconsulta: interconsulta.motivo_interconsulta,
    },
  };
}

/** Actualiza la prioridad de una interconsulta y guarda el historial (HdU02). */
export async function modificarPrioridad(
  interconsultaId: string,
  nuevaPrioridad: NivelPrioridad,
  motivo: string,
  medicoResponsable: string
): Promise<Interconsulta> {
  const respuesta = await fetch(
    `${API_BASE}/api/interconsultas/${interconsultaId}/prioridad`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prioridad: nuevaPrioridad,
        motivo,
        medico_responsable: medicoResponsable,
      }),
    }
  );

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(error?.detail || "No se pudo modificar la prioridad");
  }

  return mapearInterconsulta((await respuesta.json()) as InterconsultaApi);
}

export async function modificarEstadoInterconsulta(
  interconsultaId: string,
  estado: EstadoInterconsulta,
): Promise<Interconsulta> {
  const respuesta = await fetch(
    `${API_BASE}/api/interconsultas/${interconsultaId}/estado`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    },
  );

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(error?.detail || "No se pudo actualizar el estado");
  }

  return mapearInterconsulta((await respuesta.json()) as InterconsultaApi);
}

export async function subirCsvInterconsultas(
  archivo: File
): Promise<{
  inserted: number;
  stored?: number;
  file_type?: string;
  prioritized?: number;
  prioritization_status?: string;
}> {
  const formData = new FormData();
  formData.append("file", archivo);

  const respuesta = await fetch(`${API_BASE}/upload-csv`, {
    method: "POST",
    body: formData,
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(error?.detail || "Error al enviar el archivo al backend");
  }

  return respuesta.json();
}

async function obtenerInterconsultaApiPorId(
  id: string
): Promise<InterconsultaApi | null> {
  const respuesta = await fetch(`${API_BASE}/api/interconsultas/${id}`, {
    cache: "no-store",
  });
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) {
    throw new Error("Error al cargar la interconsulta");
  }
  return (await respuesta.json()) as InterconsultaApi;
}

function mapearInterconsulta(api: InterconsultaApi): Interconsulta {
  const prioridadSugerida = normalizarPrioridad(api.prioridad_sugerida_modelo);
  const estaPriorizada = prioridadSugerida !== null;
  const esValidaParaPriorizacion = tieneInformacionClinica(api);
  // La prioridad que se muestra es la que decidio el medico o, si aun no decidio,
  // la que sugiere el modelo. NO se cae a prioridad_original_csv: esa es la
  // etiqueta del corpus historico (la prioridad que ya asigno un especialista) y
  // mostrarla seria presentar la respuesta como si fuera la salida del sistema.
  // En produccion las interconsultas llegan sin priorizar y ese campo va vacio.
  const prioridadDisponible =
    normalizarPrioridad(api.prioridad_actual) ?? prioridadSugerida;
  // HU2-c5: sin prioridad disponible, no se debe defaultear a "baja" (el lado
  // inseguro). El "baja" de relleno solo satisface el tipo; sinPrioridad=true le
  // dice a la interfaz que no lo muestre como si fuera una prioridad real.
  const sinPrioridad = prioridadDisponible === null;
  const prioridadActual = prioridadDisponible ?? "baja";
  const confianza = api.confianza_modelo ?? 0;
  const terminosBanderaRoja = api.terminos_bandera_roja_nombres ?? [];

  return {
    id: api.id,
    pacienteId: api.id,
    pacienteNombre: `Paciente ${api.id.slice(0, 8)}`,
    pacienteRut: "XX.XXX.XXX-X",
    pacienteEdad: api.edad,
    especialidad: api.espec_destino,
    centroOrigen: api.espec_origen,
    diagnostico:
      primerTextoNoVacio(api.historia_clinica, api.fundamentos_diagnostico) ??
      "Sin diagnostico registrado",
    motivoInterconsulta:
      api.motivo_interconsulta || "Sin motivo de interconsulta registrado",
    esValidaParaPriorizacion,
    estado: normalizarEstado(api.estado),
    prioridadActual,
    sinPrioridad,
    motivoSinPrioridad: api.motivo_sin_prioridad,
    banderaRoja: api.bandera_roja,
    terminosBanderaRoja,
    prioridadForzadaPorRegla: api.prioridad_forzada_por_regla,
    priorizacionIA: {
      nivelSugerido: prioridadSugerida ?? prioridadActual,
      confianza,
      priorizada: estaPriorizada,
      probabilidades: {
        baja: api.prob_baja ?? 0,
        media: api.prob_media ?? 0,
        alta: api.prob_alta ?? 0,
      },
      justificacion: estaPriorizada
        ? "Priorizacion generada por el modelo predictivo con los datos clinicos disponibles."
        : "Interconsulta aun sin priorizacion automatica registrada.",
    },
    fechaEmision: api.fecha_emision,
    historialModificaciones: (api.modificaciones ?? []).map((modificacion) => ({
      id: modificacion.id,
      prioridadAnterior:
        normalizarPrioridad(modificacion.prioridad_anterior) ?? prioridadActual,
      prioridadNueva:
        normalizarPrioridad(modificacion.prioridad_nueva) ?? prioridadActual,
      motivo: modificacion.motivo,
      medicoResponsable: modificacion.medico_responsable,
      fecha: modificacion.created_at,
    })),
    fechaIngreso: api.created_at,
    fechaActualizacion: api.updated_at,
  };
}

function tieneInformacionClinica(api: InterconsultaApi): boolean {
  return [
    api.historia_clinica,
    api.fundamentos_diagnostico,
    api.examenes_complementarios,
    api.motivo_interconsulta,
  ].some((campo) => Boolean(campo?.trim()));
}

function normalizarPrioridad(prioridad: PrioridadApi): NivelPrioridad | null {
  const normalizada = prioridad?.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (
    normalizada === "alta" ||
    normalizada === "media" ||
    normalizada === "baja"
  ) {
    return normalizada;
  }
  return null;
}

function normalizarSexo(sexo: string): "M" | "F" {
  return sexo.trim().toUpperCase().startsWith("M") ? "M" : "F";
}

function primerTextoNoVacio(...valores: Array<string | null | undefined>) {
  return valores.find((valor) => Boolean(valor?.trim()))?.trim();
}

function construirResumenCamposClinicos(interconsulta: InterconsultaApi): string {
  const campos = [
    ["Historia clinica", interconsulta.historia_clinica],
    ["Fundamentos diagnostico", interconsulta.fundamentos_diagnostico],
    ["Examenes complementarios", interconsulta.examenes_complementarios],
    ["Motivo interconsulta", interconsulta.motivo_interconsulta],
  ];

  return campos
    .filter(([, valor]) => Boolean(valor?.trim()))
    .map(([label, valor]) => `${label}: ${valor}`)
    .join("\n\n");
}

function normalizarEstado(estado: string): EstadoInterconsulta {
  return estado.trim().toLowerCase() === "revisada" ? "revisada" : "pendiente";
}

function obtenerMensajeError(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (
    detail &&
    typeof detail === "object" &&
    "message" in detail &&
    typeof detail.message === "string"
  ) {
    return detail.message;
  }
  return fallback;
}
