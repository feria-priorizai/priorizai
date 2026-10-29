import { apiFetch, obtenerMensajeError } from "@/services/api";
import type {
  ArchivoEntrenamiento,
  CambioModelo,
  Reentrenamiento,
  ResumenReentrenamiento,
  SolicitudReentrenamiento,
  SubidaArchivo,
  VersionModelo,
} from "@/types/reentrenamiento";

const BASE = "/api/reentrenamiento";

async function lanzarError(respuesta: Response, fallback: string): Promise<never> {
  const error = await respuesta.json().catch(() => null);
  throw new Error(obtenerMensajeError(error?.detail, fallback));
}

async function obtener<T>(ruta: string, fallback: string): Promise<T> {
  const respuesta = await apiFetch(`${BASE}${ruta}`, { cache: "no-store" });
  if (!respuesta.ok) return lanzarError(respuesta, fallback);
  return respuesta.json();
}

export function obtenerResumen(): Promise<ResumenReentrenamiento> {
  return obtener("/resumen", "No se pudo cargar el resumen del reentrenamiento");
}

export function listarReentrenamientos(): Promise<Reentrenamiento[]> {
  return obtener("/trabajos", "No se pudo cargar el historial de reentrenamientos");
}

export function obtenerReentrenamiento(id: string): Promise<Reentrenamiento> {
  return obtener(`/trabajos/${encodeURIComponent(id)}`, "No se pudo cargar el reentrenamiento");
}

export function listarVersiones(): Promise<VersionModelo[]> {
  return obtener("/versiones", "No se pudo cargar la lista de versiones");
}

export function listarCambios(): Promise<CambioModelo[]> {
  return obtener("/cambios", "No se pudo cargar el historial de cambios");
}

export async function iniciarReentrenamiento(
  solicitud: SolicitudReentrenamiento,
): Promise<Reentrenamiento> {
  const respuesta = await apiFetch(`${BASE}/trabajos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(solicitud),
  });
  if (!respuesta.ok) return lanzarError(respuesta, "No se pudo iniciar el reentrenamiento");
  return respuesta.json();
}

export async function cancelarReentrenamiento(id: string): Promise<void> {
  const respuesta = await apiFetch(`${BASE}/trabajos/${encodeURIComponent(id)}/cancelar`, {
    method: "POST",
  });
  if (!respuesta.ok) return lanzarError(respuesta, "No se pudo cancelar el reentrenamiento");
}

export async function activarVersion(id: string): Promise<CambioModelo> {
  const respuesta = await apiFetch(`${BASE}/versiones/${encodeURIComponent(id)}/activar`, {
    method: "POST",
  });
  if (!respuesta.ok) return lanzarError(respuesta, "No se pudo activar la versión");
  return respuesta.json();
}

export async function subirVersion(
  archivo: File,
  opciones: { nombre?: string; ordenClases?: string } = {},
): Promise<VersionModelo> {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  if (opciones.nombre?.trim()) formulario.append("nombre", opciones.nombre.trim());
  if (opciones.ordenClases?.trim()) formulario.append("orden_clases", opciones.ordenClases.trim());
  const respuesta = await apiFetch(`${BASE}/versiones/subir`, {
    method: "POST",
    body: formulario,
  });
  if (!respuesta.ok) return lanzarError(respuesta, "No se pudo subir el modelo");
  return respuesta.json();
}

export function listarArchivosDatos(): Promise<ArchivoEntrenamiento[]> {
  return obtener("/datos", "No se pudo cargar la lista de archivos con datos");
}

export async function subirArchivoDatos(archivo: File): Promise<SubidaArchivo> {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  const respuesta = await apiFetch(`${BASE}/datos`, { method: "POST", body: formulario });
  if (!respuesta.ok) return lanzarError(respuesta, "No se pudo subir el archivo");
  return respuesta.json();
}

export async function eliminarArchivoDatos(id: string): Promise<void> {
  const respuesta = await apiFetch(`${BASE}/datos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!respuesta.ok) return lanzarError(respuesta, "No se pudo borrar el archivo");
}

/** El navegador descarga el .zip directo: pasa por el proxy de Next con la
 *  cookie de sesión, sin cargar cientos de MB en memoria de la página. */
export function urlDescargaVersion(id: string): string {
  return `${BASE}/versiones/${encodeURIComponent(id)}/descargar`;
}
