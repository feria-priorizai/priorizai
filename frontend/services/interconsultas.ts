import type { Interconsulta, NivelPrioridad } from "@/types/interconsulta";
import type { ResumenClinicoPaciente } from "@/types/paciente";
import { interconsultasMock, resumenesClinicosMock } from "@/data/mock";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

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
  created_at: string;
  updated_at: string;
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
      error?.detail || "No se pudo ejecutar la priorizacion con IA"
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
      error?.detail || "No se pudo priorizar el lote de interconsultas"
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
    rut: "No disponible",
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
  };
}

/** Actualiza la prioridad de una interconsulta (HdU02, aun en mock local). */
export async function modificarPrioridad(
  interconsultaId: string,
  nuevaPrioridad: NivelPrioridad,
  motivo: string,
  medicoResponsable: string
): Promise<Interconsulta> {
  const interconsulta = interconsultasMock.find(
    (ic) => ic.id === interconsultaId
  );
  if (!interconsulta) throw new Error("Interconsulta no encontrada");

  const modificacion = {
    id: `mod-${Date.now()}`,
    prioridadAnterior: interconsulta.prioridadActual,
    prioridadNueva: nuevaPrioridad,
    motivo,
    medicoResponsable,
    fecha: new Date().toISOString(),
  };

  interconsulta.prioridadActual = nuevaPrioridad;
  interconsulta.historialModificaciones.push(modificacion);
  interconsulta.fechaActualizacion = new Date().toISOString();

  return { ...interconsulta };
}

export async function subirCsvInterconsultas(
  archivo: File
): Promise<{ inserted: number; prioritized?: number }> {
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
  const prioridadActual =
    normalizarPrioridad(api.prioridad_actual) ??
    prioridadSugerida ??
    normalizarPrioridad(api.prioridad_original_csv) ??
    "baja";
  const confianza = api.confianza_modelo ?? 0;

  return {
    id: api.id,
    pacienteId: api.id,
    pacienteNombre: `Paciente ${api.id.slice(0, 8)}`,
    pacienteRut: "No disponible",
    pacienteEdad: api.edad,
    especialidad: api.espec_destino,
    centroOrigen: api.espec_origen,
    diagnostico:
      primerTextoNoVacio(api.historia_clinica, api.fundamentos_diagnostico) ??
      "Sin diagnostico registrado",
    motivoInterconsulta:
      api.motivo_interconsulta || "Sin motivo de interconsulta registrado",
    estado: api.prioridad_sugerida_modelo ? "revisada" : "pendiente",
    prioridadActual,
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
    historialModificaciones: [],
    fechaIngreso: api.created_at,
    fechaActualizacion: api.updated_at,
  };
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
