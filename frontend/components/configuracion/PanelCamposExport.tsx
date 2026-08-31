"use client";

import { useConfiguracionExport } from "@/hooks/useConfiguracionCampos";
import { TODOS_LOS_CAMPOS } from "@/types/campos";
import { CampoCheckbox } from "./CampoCheckbox";
import { IconoGrupo } from "./iconos";

const GRUPOS: Array<{ clave: "paciente" | "clinico" | "priorizacion" | "metadatos"; titulo: string }> = [
  { clave: "paciente", titulo: "Datos del Paciente" },
  { clave: "clinico", titulo: "Información Clínica" },
  { clave: "priorizacion", titulo: "Priorización" },
  { clave: "metadatos", titulo: "Metadatos" },
];

export function PanelCamposExport() {
  const { camposExport, toggleCampo, puedeEditar } = useConfiguracionExport();

  return (
    <div className="flex flex-col gap-4">
      {!puedeEditar && (
        <p
          className="px-3 py-2.5 text-[.85rem]"
          style={{
            background: "var(--pz-media-bg)",
            borderLeft: "2px solid var(--pz-media)",
            color: "var(--pz-media)",
          }}
        >
          Solo los administradores pueden modificar esta configuración.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {GRUPOS.map(({ clave, titulo }) => {
          const campos = TODOS_LOS_CAMPOS.filter(c => c.grupo === clave);
          if (campos.length === 0) return null;

          return (
            <div key={clave}>
              <div className="mb-2 flex items-center gap-2">
                <IconoGrupo
                  tipo={clave}
                  className="h-3.5 w-3.5 text-[var(--pz-ink-3)]"
                />
                <span className="pz-label">{titulo}</span>
              </div>
              <div className="flex flex-col gap-1.5">
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
