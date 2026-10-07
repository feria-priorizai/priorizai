import type {
  EntidadesPorCampo,
  EstadoInterconsulta,
  Interconsulta,
  NivelPrioridad,
} from "@/types/interconsulta";
import { apiFetch, obtenerMensajeError } from "@/services/api";

export const EVENTO_INTERCONSULTAS_ACTUALIZADAS =
  "priorizai:interconsultas-actualizadas";
/** Resumen de una carga de archivo; lo muestra ModalResultadoCarga. */
export const EVENTO_RESULTADO_CARGA = "priorizai:resultado-carga";

/** Fila del archivo que no se guardó. `campos_faltantes` trae nombres de
 *  columna o, si el problema fue otro, el motivo en texto. */
export interface FilaRechazada {
  fila: number;
  campos_faltantes: string[];
  datos_raw: Record<string, unknown>;
}

export type ResultadoCarga =
  | {
      archivo: string;
      guardadas: number;
      priorizadas: number;
      rechazadas: FilaRechazada[];
    }
  | { archivo: string; error: string };

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

const TAMANO_PAGINA = 100;
const MAXIMO_EN_MEMORIA = 2000;

export interface ListadoInterconsultas {
  interconsultas: Interconsulta[];
  total: number;
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
export async function obtenerInterconsultas(
  signal?: AbortSignal,
): Promise<ListadoInterconsultas> {
  const acumuladas: Interconsulta[] = [];
  let total = 0;

  for (let offset = 0; offset < MAXIMO_EN_MEMORIA; offset += TAMANO_PAGINA) {
    const respuesta = await apiFetch(
      `/api/interconsultas?limit=${TAMANO_PAGINA}&offset=${offset}`,
      { cache: "no-store", signal }
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
  const respuesta = await apiFetch(`/api/interconsultas/${id}`, {
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
  const respuesta = await apiFetch(`/api/interconsultas/priorizar`, {
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

/** RF7: vuelve a evaluar el catalogo de banderas rojas sobre todas las IC. */
export async function reevaluarBanderasRojas(): Promise<{
  total_evaluadas: number;
  total_con_bandera_roja: number;
}> {
  const respuesta = await apiFetch(
    `/api/interconsultas/reevaluar-banderas`,
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

/**
 * Actualiza la prioridad de una interconsulta y guarda el historial (HdU02).
 * El médico responsable no se envía: el backend lo toma de la sesión.
 */
export async function modificarPrioridad(
  interconsultaId: string,
  nuevaPrioridad: NivelPrioridad,
  motivo: string,
): Promise<Interconsulta> {
  const respuesta = await apiFetch(
    `/api/interconsultas/${interconsultaId}/prioridad`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prioridad: nuevaPrioridad,
        motivo,
      }),
    }
  );

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(
      obtenerMensajeError(error?.detail, "No se pudo modificar la prioridad")
    );
  }

  return mapearInterconsulta((await respuesta.json()) as InterconsultaApi);
}

export async function modificarEstadoInterconsulta(
  interconsultaId: string,
  estado: EstadoInterconsulta,
): Promise<Interconsulta> {
  const respuesta = await apiFetch(
    `/api/interconsultas/${interconsultaId}/estado`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    },
  );

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(
      obtenerMensajeError(error?.detail, "No se pudo actualizar el estado")
    );
  }

  return mapearInterconsulta((await respuesta.json()) as InterconsultaApi);
}

export async function subirCsvInterconsultas(
  archivo: File,
  camposObligatorios?: string[],
): Promise<{
  inserted: number;
  stored: number;
  file_type: string;
  prioritized: number;
  prioritization_status: string;
  ids: string[];
  rejected: FilaRechazada[];
  rejected_count: number;
}> {
  const formData = new FormData();
  formData.append("file", archivo);
  if (camposObligatorios) {
    formData.append("campos_obligatorios", camposObligatorios.join(","));
  }

  const respuesta = await apiFetch(`/upload-csv`, {
    method: "POST",
    body: formData,
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(
      obtenerMensajeError(error?.detail, "Error al enviar el archivo al backend")
    );
  }

  return respuesta.json();
}

function mapearInterconsulta(api: InterconsultaApi): Interconsulta {
  const prioridadSugerida = normalizarPrioridad(api.prioridad_sugerida_modelo);
  const estaPriorizada = prioridadSugerida !== null;
  const esValidaParaPriorizacion = tieneInformacionClinica(api);
  const prioridadDisponible =
    normalizarPrioridad(api.prioridad_actual) ?? prioridadSugerida;
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
