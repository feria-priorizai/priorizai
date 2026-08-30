"use client";

import { useConfiguracionExport } from "@/hooks/useConfiguracionCampos";
import { TODOS_LOS_CAMPOS } from "@/types/campos";
import { CampoCheckbox } from "./CampoCheckbox";
import { IconoGrupo, IconoCandado } from "./iconos";

const GRUPOS: Array<{ clave: "paciente" | "clinico" | "priorizacion" | "metadatos"; titulo: string }> = [
  { clave: "paciente", titulo: "Datos del Paciente" },
  { clave: "clinico", titulo: "Información Clínica" },
  { clave: "priorizacion", titulo: "Priorización" },
  { clave: "metadatos", titulo: "Metadatos" },
];

export function PanelCamposExport() {
  const { camposExport, toggleCampo, puedeEditar } = useConfiguracionExport();

  return (
    <div className="space-y-4">
      {!puedeEditar && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--prioridad-media-bg)] p-3 text-sm text-[var(--prioridad-media)]">
          <IconoCandado />
          <span>Solo los administradores pueden modificar la configuración de exportación.</span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {GRUPOS.map(({ clave, titulo }) => {
          const campos = TODOS_LOS_CAMPOS.filter(c => c.grupo === clave);
          if (campos.length === 0) return null;

          return (
            <div key={clave}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                <IconoGrupo tipo={clave} className="h-3.5 w-3.5" />
                <span>{titulo}</span>
              </div>
              <div className="flex flex-col gap-2">
                {campos.map(campo => (
                  <CampoCheckbox
                    key={campo.clave}
                    campo={campo}
                    checked={camposExport.includes(campo.clave)}
                    onChange={() => toggleCampo(campo.clave)}
                    disabled={!puedeEditar}
                    modo="export"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
