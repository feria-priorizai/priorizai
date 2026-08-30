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
    <label className={`flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--surface-hover)]"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        className="h-5 w-5 rounded border-[var(--border)] bg-[var(--background)] text-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--surface)] shrink-0"
        aria-label={campo.etiqueta}
      />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <IconoGrupo tipo={campo.grupo} className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <span className="font-medium text-[var(--text-primary)]">{campo.etiqueta}</span>
        {esObligatorio && (
          <span className="ml-auto shrink-0 rounded-full bg-[var(--prioridad-alta-bg)] px-2 py-0.5 text-xs font-medium text-[var(--prioridad-alta)]">
            Obligatorio
          </span>
        )}
        {esSoloAdmin && (
          <span className="ml-auto shrink-0 rounded-full bg-[var(--primary-bg)] px-2 py-0.5 text-xs font-medium text-[var(--primary)]">
            Solo Admin
          </span>
        )}
      </div>
    </label>
  );
}
