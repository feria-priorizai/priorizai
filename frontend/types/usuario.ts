/**
 * Tipos relacionados con los usuarios del sistema.
 */

/** Roles de usuario definidos en el sistema. Deben coincidir con ROLES del
 *  backend (app/services/auth.py). */
export type RolUsuario =
  | "medico_especialista"
  | "medico_general"
  | "enfermera"
  | "tens"
  | "secretaria"
  | "administrador";

export const ETIQUETAS_ROL: Record<RolUsuario, string> = {
  medico_especialista: "Médico especialista",
  medico_general: "Médico general",
  enfermera: "Enfermera",
  tens: "TENS",
  secretaria: "Secretaria",
  administrador: "Administrador",
};

/** Datos del usuario autenticado en el sistema */
export interface Usuario {
  id: string;
  alias: string;
  nombre: string;
  correo: string | null;
  rol: RolUsuario;
  especialidad: string | null;
  activo: boolean;
  debe_cambiar_password: boolean;
}
