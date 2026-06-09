/**
 * Servicio de interconsultas.
 * Capa de abstracción entre la UI y el origen de datos.
 *
 * Actualmente usa datos simulados (mock). Cuando el backend FastAPI
 * esté disponible, solo se deben cambiar las implementaciones aquí
 * sin modificar los componentes que consumen el servicio.
 *
 * Cada función simula un delay para emular latencia de red.
 */

import type { Interconsulta, NivelPrioridad } from "@/types/interconsulta";
import type { ResumenClinicoPaciente } from "@/types/paciente";
import { interconsultasMock, resumenesClinicosMock } from "@/data/mock";

// TODO: Reemplazar con variable de entorno cuando el backend esté listo
// const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** Simula latencia de red para dar realismo a la UI */
const simularLatencia = (ms: number = 300) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Obtiene todas las interconsultas del sistema */
export async function obtenerInterconsultas(): Promise<Interconsulta[]> {
  await simularLatencia();
  // TODO: fetch(`${API_BASE}/api/interconsultas`)
  return [...interconsultasMock];
}

/** Obtiene una interconsulta por su ID */
export async function obtenerInterconsultaPorId(
  id: string
): Promise<Interconsulta | null> {
  await simularLatencia();
  // TODO: fetch(`${API_BASE}/api/interconsultas/${id}`)
  return interconsultasMock.find((ic) => ic.id === id) ?? null;
}

/** Obtiene el resumen clínico de un paciente (HdU03) */
export async function obtenerResumenClinico(
  pacienteId: string
): Promise<ResumenClinicoPaciente | null> {
  await simularLatencia(500);
  // TODO: fetch(`${API_BASE}/api/pacientes/${pacienteId}/resumen-clinico`)
  return resumenesClinicosMock[pacienteId] ?? null;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** Actualiza la prioridad de una interconsulta (HdU02) */
export async function modificarPrioridad(
  interconsultaId: string,
  nuevaPrioridad: NivelPrioridad,
  motivo: string,
  medicoResponsable: string
): Promise<Interconsulta> {
  await simularLatencia(400);
  // TODO: fetch(`${API_BASE}/api/interconsultas/${interconsultaId}/prioridad`, {
  //   method: "PATCH",
  //   body: JSON.stringify({ prioridad: nuevaPrioridad, motivo }),
  // })

  const interconsulta = interconsultasMock.find(
    (ic) => ic.id === interconsultaId
  );
  if (!interconsulta) throw new Error("Interconsulta no encontrada");

  /* Simula la modificación en el mock local */
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
  archivo: File,
): Promise<{ inserted: number }> {
  const formData = new FormData();
  formData.append("file", archivo);

  const respuesta = await fetch(`${API_BASE}/upload-csv`, {
    method: "POST",
    body: formData,
  });

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(
      error?.detail || "Error al enviar el CSV al backend",
    );
  }

  return respuesta.json();
}
