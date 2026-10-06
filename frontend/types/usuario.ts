/**
 * Tipos relacionados con los usuarios del sistema.
 */

/** Roles de usuario definidos en el sistema. Deben coincidir con ROLES del
 *  backend (app/services/auth.py). */
export type RolUsuario = "medico" | "administrador";

export const ETIQUETAS_ROL: Record<RolUsuario, string> = {
  medico: "Médico",
  administrador: "Administrador",
};

/** Especialidades que puede tener un médico. Deben coincidir con
 *  ESPECIALIDADES del backend (app/services/auth.py). */
export const ESPECIALIDADES = [
  "Broncopulmonar",
  "Cardiología",
  "Cirugía General",
  "Dermatología",
  "Endocrinología",
  "Gastroenterología",
  "Geriatría",
  "Ginecología y Obstetricia",
  "Hematología",
  "Infectología",
  "Medicina General",
  "Medicina Interna",
  "Nefrología",
  "Neurocirugía",
  "Neurología",
  "Oftalmología",
  "Oncología",
  "Otorrinolaringología",
  "Pediatría",
  "Psiquiatría",
  "Reumatología",
  "Traumatología",
  "Urología",
] as const;

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
  /** Solo en el listado de cuentas: demasiados intentos fallidos recientes. */
  bloqueado_por_intentos?: boolean;
}
