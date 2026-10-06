import type { RolUsuario, Usuario } from "@/types/usuario";
import { apiFetch, obtenerMensajeError } from "@/services/api";

async function lanzarError(respuesta: Response, fallback: string): Promise<never> {
  const error = await respuesta.json().catch(() => null);
  throw new Error(obtenerMensajeError(error?.detail, fallback));
}

export async function iniciarSesion(alias: string, password: string): Promise<Usuario> {
  const respuesta = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias, password }),
  });
  if (!respuesta.ok) {
    return lanzarError(respuesta, "No se pudo iniciar sesión");
  }
  return respuesta.json();
}

export async function cerrarSesion(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

/** Usuario de la sesión actual, o null si no hay sesión válida. */
export async function obtenerSesion(): Promise<Usuario | null> {
  const respuesta = await apiFetch("/api/auth/me", { cache: "no-store" });
  if (respuesta.status === 401) return null;
  if (!respuesta.ok) {
    return lanzarError(respuesta, "No se pudo verificar la sesión");
  }
  return respuesta.json();
}

export async function cambiarPassword(
  passwordActual: string,
  passwordNueva: string,
): Promise<Usuario> {
  const respuesta = await apiFetch("/api/auth/cambiar-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      password_actual: passwordActual,
      password_nueva: passwordNueva,
    }),
  });
  if (!respuesta.ok) {
    return lanzarError(respuesta, "No se pudo cambiar la contraseña");
  }
  return respuesta.json();
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const respuesta = await apiFetch("/api/usuarios", { cache: "no-store" });
  if (!respuesta.ok) {
    return lanzarError(respuesta, "No se pudo cargar la lista de usuarios");
  }
  return respuesta.json();
}

export interface DatosCuenta {
  nombre: string;
  correo: string;
  rol: RolUsuario;
  especialidad: string;
}

export interface NuevaCuenta extends DatosCuenta {
  alias: string;
  password: string;
}

export interface EdicionCuenta extends DatosCuenta {
  password_temporal: string | null;
}

/** Envía un cuerpo JSON a la API de cuentas y lanza el mensaje del backend si
 *  falla. */
async function enviarCuenta(
  ruta: string,
  method: string,
  cuerpo: unknown,
  fallback: string,
): Promise<Usuario> {
  const respuesta = await apiFetch(ruta, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) {
    return lanzarError(respuesta, fallback);
  }
  return respuesta.json();
}

export async function crearUsuario(cuenta: NuevaCuenta): Promise<Usuario> {
  return enviarCuenta(
    "/api/usuarios",
    "POST",
    { ...cuenta, especialidad: cuenta.especialidad || null },
    "No se pudo crear la cuenta",
  );
}

export async function editarUsuario(id: string, cuenta: EdicionCuenta): Promise<Usuario> {
  return enviarCuenta(
    `/api/usuarios/${id}`,
    "PATCH",
    { ...cuenta, especialidad: cuenta.especialidad || null },
    "No se pudo actualizar la cuenta",
  );
}

export async function cambiarEstadoUsuario(id: string, activo: boolean): Promise<Usuario> {
  return enviarCuenta(
    `/api/usuarios/${id}/estado`,
    "PATCH",
    { activo },
    activo ? "No se pudo desbloquear la cuenta" : "No se pudo bloquear la cuenta",
  );
}

export async function eliminarUsuario(id: string): Promise<void> {
  const respuesta = await apiFetch(`/api/usuarios/${id}`, { method: "DELETE" });
  if (!respuesta.ok) {
    await lanzarError(respuesta, "No se pudo eliminar la cuenta");
  }
}
