/**
 * Estilos por clase de entidad clinica.
 *
 * La paleta evita a proposito el rojo/ambar/verde, que en esta interfaz ya
 * significan prioridad alta/media/baja. Un resaltado verde dentro del texto no
 * debe leerse como "prioridad baja".
 */

import type { ClaseEntidad } from "@/types/interconsulta";

interface EstiloEntidad {
  /** Fondo del <mark> dentro del texto clinico. */
  marca: string;
  /** Chip de la tabla resumen. */
  chip: string;
  /** Punto de color de la leyenda. */
  punto: string;
  /** Titulo en plural para la tabla. */
  plural: string;
}

export const CLASES_ENTIDAD: Record<ClaseEntidad, EstiloEntidad> = {
  Enfermedad: {
    marca: "bg-violet-100 text-violet-900",
    chip: "border-violet-200 bg-violet-50 text-violet-800",
    punto: "bg-violet-500",
    plural: "Enfermedades",
  },
  Farmaco: {
    marca: "bg-teal-100 text-teal-900",
    chip: "border-teal-200 bg-teal-50 text-teal-800",
    punto: "bg-teal-500",
    plural: "Farmacos",
  },
  Sigla: {
    marca: "bg-orange-100 text-orange-900",
    chip: "border-orange-200 bg-orange-50 text-orange-800",
    punto: "bg-orange-500",
    plural: "Siglas",
  },
  Sintoma: {
    marca: "bg-pink-100 text-pink-900",
    chip: "border-pink-200 bg-pink-50 text-pink-800",
    punto: "bg-pink-500",
    plural: "Sintomas",
  },
};

/** Orden en que se muestran las clases, de mas a menos relevante. */
export const ORDEN_CLASES: ClaseEntidad[] = [
  "Enfermedad",
  "Sintoma",
  "Farmaco",
  "Sigla",
];
