/**
 * Base de todas las llamadas a la API.
 *
 * Las rutas son relativas: el navegador habla solo con el servidor de Next, que
 * reenvía /api y /upload-csv al backend (next.config.ts). Así la cookie de
 * sesión es del mismo origen que la página, se despliegue como se despliegue,
 * y el navegador nunca la trata como cookie de terceros.
 */

export class SesionExpiradaError extends Error {}

/** Lleva al login y vuelve después a la página actual. */
export function irAlLogin(): void {
  const destino = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(destino)}`);
}

/**
 * fetch con la cookie de sesión. Un 401 fuera de /api/auth significa que la
 * sesión venció o se cerró en otro lado: se manda al login en vez de mostrar
 * un error que el usuario no puede resolver.
 */
export async function apiFetch(ruta: string, init?: RequestInit): Promise<Response> {
  const respuesta = await fetch(ruta, { credentials: "same-origin", ...init });
  if (respuesta.status === 401 && !ruta.startsWith("/api/auth/")) {
    irAlLogin();
    throw new SesionExpiradaError("Tu sesión expiró. Inicia sesión nuevamente.");
  }
  return respuesta;
}

export function obtenerMensajeError(detail: unknown, fallback: string): string {
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
