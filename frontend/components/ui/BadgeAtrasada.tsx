/**
 * Interconsulta atrasada (HDU-22): sigue pendiente y ya superó el plazo de
 * revisión de su prioridad. Contorno punteado y tinta, para no confundirse con
 * la bandera roja, que es un fondo rojo lleno.
 */

import { textoDias } from "@/utils/plazos";

interface BadgeAtrasadaProps {
  dias: number;
  /** Solo el número, para la columna de la tabla. */
  compacta?: boolean;
}

export default function BadgeAtrasada({ dias, compacta = false }: BadgeAtrasadaProps) {
  const descripcion = `Atrasada: ${textoDias(dias)} sobre el plazo de revisión`;
  return (
    <span className="pz-chip pz-chip--atrasada" data-testid="atrasada" title={descripcion}>
      <span aria-hidden="true">◷ </span>
      {compacta ? (
        <>
          <span aria-hidden="true">+{dias} d</span>
          <span className="visually-hidden">{descripcion}</span>
        </>
      ) : (
        `Atrasada · +${dias} d`
      )}
    </span>
  );
}
