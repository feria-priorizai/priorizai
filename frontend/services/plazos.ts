import type { PlazosRevision } from "@/types/interconsulta";
import { apiFetch, obtenerMensajeError } from "@/services/api";

/** Plazos de revisión vigentes (HDU-22). Mientras nadie los defina, rigen los de fábrica. */
export async function obtenerPlazosRevision(): Promise<PlazosRevision> {
  const respuesta = await apiFetch("/api/plazos-revision", { cache: "no-store" });
  if (!respuesta.ok) {
    throw new Error("No se pudieron cargar los plazos de revisión");
  }
  return respuesta.json();
}

/**
 * Guarda los tres plazos de una vez. Solo un administrador puede: a un médico
 * el backend le responde 403 aunque llame a la API sin pasar por la interfaz.
 */
export async function guardarPlazosRevision(
  plazos: PlazosRevision,
): Promise<PlazosRevision> {
  const respuesta = await apiFetch("/api/plazos-revision", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plazos),
  });
  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(
      obtenerMensajeError(error?.detail, "No se pudieron guardar los plazos de revisión"),
    );
  }
  return respuesta.json();
}
