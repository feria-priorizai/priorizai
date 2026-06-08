/**
 * Tipos relacionados con los usuarios del sistema.
 * El sistema maneja tres roles principales según las historias de usuario.
 */

/** Roles de usuario definidos en el sistema */
export type RolUsuario =
  | "medico_especialista"
  | "medico_general"
  | "enfermera"
  | "tens"
  | "secretaria"
  | "administrador";

/** Datos del usuario autenticado en el sistema */
export interface Usuario {
  id: string;
  nombre: string;
  rol: RolUsuario;
  especialidad?: string;
  centroSalud: string;
}
