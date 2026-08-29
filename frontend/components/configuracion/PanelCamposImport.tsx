"use client";

import { useConfiguracionImport } from "@/hooks/useConfiguracionCampos";
import { TODOS_LOS_CAMPOS } from "@/types/campos";
import { Accordion } from "@/components/ui/Accordion";
import { CampoCheckbox } from "./CampoCheckbox";
import { IconoGrupo, IconoCandado } from "./iconos";

const GRUPOS: Array<{ clave: "paciente" | "clinico" | "priorizacion" | "metadatos"; titulo: string }> = [
  { clave: "paciente", titulo: "Datos del Paciente" },
  { clave: "clinico", titulo: "Información Clínica" },
  { clave: "priorizacion", titulo: "Priorización" },
  { clave: "metadatos", titulo: "Metadatos" },
];

export function PanelCamposImport() {
  const { camposObligatorios, toggleCampo, puedeEditar } = useConfiguracionImport();

  return (
    <div className="space-y-3">
      {!puedeEditar && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--prioridad-media-bg)] p-3 text-sm text-[var(--prioridad-media)]">
          <IconoCandado />
          <span>Solo los administradores pueden modificar la configuración de importación.</span>
        </div>
      )}

      {GRUPOS.map(({ clave, titulo }) => {
        const campos = TODOS_LOS_CAMPOS.filter(c => c.grupo === clave);
        if (campos.length === 0) return null;

        const seleccionados = campos.filter(c => camposObligatorios.includes(c.clave)).length;
        const todosSeleccionados = campos.every(c => camposObligatorios.includes(c.clave));

        return (
          <Accordion key={clave} titulo={titulo} icono={<IconoGrupo tipo={clave} />} className="border-[var(--border)]">
            <div className="space-y-2">
              {campos.map(campo => (
                <CampoCheckbox
                  key={campo.clave}
                  campo={campo}
                  checked={camposObligatorios.includes(campo.clave)}
                  onChange={() => toggleCampo(campo.clave)}
                  disabled={!puedeEditar}
                  modo="import"
                />
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>{seleccionados} de {campos.length} campos obligatorios</span>
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => {
                    const deberiaSeleccionar = !todosSeleccionados;
                    campos.forEach(c => {
                      const estaSeleccionado = camposObligatorios.includes(c.clave);
                      if (deberiaSeleccionar !== estaSeleccionado) {
                        toggleCampo(c.clave);
                      }
                    });
                  }}
                  className="text-[var(--primary)] hover:underline"
                >
                  {todosSeleccionados ? "Deseleccionar todos" : "Seleccionar todos"}
                </button>
              )}
            </div>
          </Accordion>
        );
      })}
    </div>
  );
}
