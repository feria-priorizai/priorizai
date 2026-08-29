"use client";

import type { DefinicionCampo } from "@/types/campos";
import { IconoGrupo } from "./iconos";

interface CampoCheckboxProps {
  campo: DefinicionCampo;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  modo: "import" | "export";
}

export function CampoCheckbox({ campo, checked, onChange, disabled, modo }: CampoCheckboxProps) {
  const esObligatorio = modo === "import" && campo.obligatorioPorDefecto;
  const esSoloAdmin = campo.soloAdmin;

  return (
    <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--surface-hover)]"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-[var(--border)] bg-[var(--background)] text-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--surface)]"
        aria-label={campo.etiqueta}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <IconoGrupo tipo={campo.grupo} className="h-4 w-4 align-middle" />
          <span className="font-medium text-[var(--text-primary)] truncate">{campo.etiqueta}</span>
          {esObligatorio && (
            <span className="inline-flex items-center rounded-full bg-[var(--prioridad-alta-bg)] px-2 py-0.5 text-xs font-medium text-[var(--prioridad-alta)]">
              Obligatorio
            </span>
          )}
          {esSoloAdmin && (
            <span className="inline-flex items-center rounded-full bg-[var(--primary-bg)] px-2 py-0.5 text-xs font-medium text-[var(--primary)]">
              Solo Admin
            </span>
          )}
        </div>
        {campo.descripcion && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{campo.descripcion}</p>
        )}
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="px-2 py-0.5 rounded bg-[var(--background)]">{campo.tipo}</span>
          <span className="px-2 py-0.5 rounded bg-[var(--background)] capitalize">{campo.grupo}</span>
        </div>
      </div>
    </label>
  );
}