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

export function CampoCheckbox({
  campo,
  checked,
  onChange,
  disabled,
  modo,
}: CampoCheckboxProps) {
  const esObligatorio = modo === "import" && campo.obligatorioPorDefecto;

  return (
    <label className={`pz-campo ${disabled ? "pz-campo--off" : ""}`}>
      <input
        type="checkbox"
        className="form-check-input mt-0 flex-none"
        checked={checked}
        disabled={disabled}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        aria-label={campo.etiqueta}
      />

      <IconoGrupo
        tipo={campo.grupo}
        className="h-3.5 w-3.5 flex-none text-[var(--pz-ink-3)]"
      />

      <span className="min-w-0 flex-1 truncate text-[.88rem] font-medium text-[var(--pz-ink)]">
        {campo.etiqueta}
      </span>

      {esObligatorio && (
        <span className="pz-chip pz-chip--alta flex-none">Obligatorio</span>
      )}
      {campo.soloAdmin && (
        <span className="pz-chip pz-chip--neutral flex-none">Solo admin</span>
      )}
    </label>
  );
}
