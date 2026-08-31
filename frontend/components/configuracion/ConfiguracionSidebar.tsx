"use client";

import { useConfiguracion } from "@/context/ConfiguracionContext";
import { PanelCamposImport } from "./PanelCamposImport";
import { PanelCamposExport } from "./PanelCamposExport";
import { IconoImport, IconoExport } from "./iconos";

export function ConfiguracionSidebar() {
  const { puedeVer, puedeEditar, restablecerDefaults, usuario } = useConfiguracion();

  const badgeClassName = usuario?.rol === "admin"
    ? "bg-[var(--primary-bg)] text-[var(--primary)]"
    : "bg-[var(--prioridad-baja-bg)] text-[var(--prioridad-baja)]";

  if (!puedeVer) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Info de usuario y permisos */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center gap-3 text-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-bg)]">
            <svg className="h-5 w-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-[var(--text-primary)]">{usuario?.nombre ?? "Usuario"}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClassName}`}>
                {usuario?.rol ?? "médico"}
              </span>
            </div>
          </div>
        </div>
        {!puedeEditar && (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Contacte al administrador para modificar la configuración.
          </p>
        )}
      </div>

      {/* Paneles Import y Export lado a lado */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <IconoImport className="h-4 w-4 text-[var(--text-muted)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Campos obligatorios para import
            </h2>
          </div>
          <PanelCamposImport />
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <IconoExport className="h-4 w-4 text-[var(--text-muted)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Campos en export (JSON/CSV/XLSX)
            </h2>
          </div>
          <PanelCamposExport />
        </section>
      </div>

      {/* Acciones */}
      {puedeEditar && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <button
            type="button"
            onClick={restablecerDefaults}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Restablecer valores por defecto
          </button>
        </div>
      )}
    </div>
  );
}
