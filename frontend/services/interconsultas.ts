import type {
  EntidadesPorCampo,
  EstadoInterconsulta,
  Interconsulta,
  NivelPrioridad,
} from "@/types/interconsulta";
import type { ResumenClinicoPaciente } from "@/types/paciente";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

export const EVENTO_INTERCONSULTAS_ACTUALIZADAS =
  "priorizai:interconsultas-actualizadas";
export const EVENTO_ERRORES_CARGA = "priorizai:errores-carga";

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
  entidades?: EntidadesPorCampo | null;
  entidades_error?: string | null;
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

/** Filas por peticion y tope de lo que el cliente mantiene en memoria. */
const TAMANO_PAGINA = 100;
const MAXIMO_EN_MEMORIA = 2000;

export interface ListadoInterconsultas {
  interconsultas: Interconsulta[];
  /** Total en el servidor, no el largo de lo cargado. */
  total: number;
  /** true si el servidor tiene mas de las que se pudieron cargar. */
  truncado: boolean;
}

/**
 * Obtiene la lista de espera completa, pagina por pagina.
 *
 * Antes se pedia una sola pagina de 100 y se mostraba su largo como si fuera el
 * total: con un archivo real el resto de la lista desaparecia en silencio, y
 * justo el final de la cola (las de menor prioridad y las mas nuevas), que es
 * el orden que define el backend.
 */
export async function obtenerInterconsultas(): Promise<ListadoInterconsultas> {
  const acumuladas: Interconsulta[] = [];
  let total = 0;

  for (let offset = 0; offset < MAXIMO_EN_MEMORIA; offset += TAMANO_PAGINA) {
    const respuesta = await fetch(
      `${API_BASE}/api/interconsultas?limit=${TAMANO_PAGINA}&offset=${offset}`,
      { cache: "no-store" }
    );
    if (!respuesta.ok) {
      throw new Error("Error al cargar las interconsultas");
    }

    const informado = Number(respuesta.headers.get("X-Total-Count"));
    if (Number.isFinite(informado) && informado > 0) {
      total = informado;
    }

    const pagina = (await respuesta.json()) as InterconsultaApi[];
    acumuladas.push(...pagina.map(mapearInterconsulta));

    if (pagina.length < TAMANO_PAGINA || acumuladas.length >= total) {
      break;
    }
  }

  return {
    interconsultas: acumuladas,
    total: Math.max(total, acumuladas.length),
    truncado: acumuladas.length < total,
  };
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

/** Construye un resumen clinico con los campos reales disponibles de la IC. */
export async function obtenerResumenClinico(
  pacienteId: string
): Promise<ResumenClinicoPaciente | null> {
  const interconsulta = await obtenerInterconsultaApiPorId(pacienteId);
  if (!interconsulta) {
    return null;
  }

  return {
    pacienteId: interconsulta.id,
    informacionSuficiente: tieneInformacionClinica(interconsulta),
    camposInterconsulta: {
      historiaClinica: interconsulta.historia_clinica,
      fundamentosDiagnostico: interconsulta.fundamentos_diagnostico,
      examenesComplementarios: interconsulta.examenes_complementarios ?? "",
      motivoInterconsulta: interconsulta.motivo_interconsulta,
    },
  };
}

/** RF7: vuelve a evaluar el catalogo de banderas rojas sobre todas las IC. */
export async function reevaluarBanderasRojas(): Promise<{
  total_evaluadas: number;
  total_con_bandera_roja: number;
}> {
  const respuesta = await fetch(
    `${API_BASE}/api/interconsultas/reevaluar-banderas`,
    { method: "POST" }
  );

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(
      obtenerMensajeError(
        error?.detail,
        "No se pudo reevaluar las banderas rojas"
      )
    );
  }

  return respuesta.json();
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
  stored: number;
  file_type: string;
  prioritized: number;
  prioritization_status: string;
  ids: string[];
  rejected: Array<{fila: number; campos_faltantes: string[]; datos_raw: Record<string, unknown>}>;
  rejected_count: number;
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

    // Campos crudos del backend (para export configurable)
    especOrigen: api.espec_origen,
    especDestino: api.espec_destino,
    sexo: api.sexo,
    edad: api.edad,
    historiaClinica: api.historia_clinica,
    fundamentosDiagnostico: api.fundamentos_diagnostico,
    examenesComplementarios: api.examenes_complementarios,
    prioridadOriginalCsv: api.prioridad_original_csv,
    entidades: api.entidades ?? null,
    entidadesError: api.entidades_error ?? null,
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

function primerTextoNoVacio(...valores: Array<string | null | undefined>) {
  return valores.find((valor) => Boolean(valor?.trim()))?.trim();
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
