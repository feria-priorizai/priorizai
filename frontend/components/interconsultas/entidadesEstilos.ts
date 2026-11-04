/**
 * Estilos por clase de entidad clinica.
 *
 * La paleta evita a proposito el rojo/ambar/verde, que en esta interfaz ya
 * significan prioridad alta/media/baja. Un resaltado verde dentro del texto no
 * debe leerse como "prioridad baja".
 */

import type { ClaseEntidad } from "@/types/interconsulta";

interface EstiloEntidad {
  marca: string;
  chip: string;
  punto: string;
  plural: string;
}

export const CLASES_ENTIDAD: Record<ClaseEntidad, EstiloEntidad> = {
  Enfermedad: {
    marca: "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
    chip: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200",
    punto: "bg-violet-500",
    plural: "Enfermedades",
  },
  Farmaco: {
    marca: "bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100",
    chip: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-200",
    punto: "bg-teal-500",
    plural: "Farmacos",
  },
  Sigla: {
    marca: "bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100",
    chip: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200",
    punto: "bg-orange-500",
    plural: "Siglas",
  },
  Sintoma: {
    marca: "bg-pink-100 text-pink-900 dark:bg-pink-900 dark:text-pink-100",
    chip: "border-pink-200 bg-pink-50 text-pink-800 dark:border-pink-700 dark:bg-pink-950 dark:text-pink-200",
    punto: "bg-pink-500",
    plural: "Sintomas",
  },
};

export const ORDEN_CLASES: ClaseEntidad[] = [
  "Enfermedad",
  "Sintoma",
  "Farmaco",
  "Sigla",
];
