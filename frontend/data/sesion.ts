import type { Usuario } from "@/types/usuario";

/**
 * Usuario de la sesión actual.
 *
 * Provisional: el sistema todavía no tiene autenticación, así que el médico
 * responsable que queda registrado en el historial de modificaciones (HdU02)
 * sale de aquí. Cuando exista login, este es el único archivo que cambia.
 */
export const usuarioActual: Usuario = {
  id: "usr-001",
  nombre: "Dra. María González",
  rol: "medico_especialista",
  especialidad: "Cardiología",
  centroSalud: "Hospital San Juan de Dios",
};
