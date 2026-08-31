"use client";

import { useConfiguracion } from "@/context/ConfiguracionContext";
import { PanelCamposImport } from "./PanelCamposImport";
import { PanelCamposExport } from "./PanelCamposExport";

export function ConfiguracionSidebar() {
  const { puedeVer, puedeEditar, restablecerDefaults, usuario } =
    useConfiguracion();

  if (!puedeVer) {
    return null;
  }

  const iniciales = (usuario?.nombre ?? "Usuario")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="flex flex-col gap-5">
      <div className="pz-panel">
        <div className="pz-panel__body flex flex-wrap items-center gap-4">
          <div
            className="pz-mono flex h-9 w-9 flex-none items-center justify-center text-[.7rem] font-semibold"
            style={{
              background: "var(--pz-green)",
              color: "#05231B",
              borderRadius: "2px",
            }}
          >
            {iniciales}
          </div>

          <div className="min-w-0">
            <span className="pz-label">Sesión</span>
            <p className="mt-0.5 text-[.92rem] font-semibold text-[var(--pz-ink)]">
              {usuario?.nombre ?? "Usuario"}
            </p>
          </div>

          <span
            className={`pz-chip ${
              usuario?.rol === "admin" ? "pz-chip--ink" : "pz-chip--baja"
            }`}
          >
            {usuario?.rol ?? "médico"}
          </span>

          {!puedeEditar && (
            <p className="pz-label ms-auto max-w-[28ch]">
              Contacte al administrador para modificar la configuración
            </p>
          )}
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <section className="pz-panel h-100">
            <div className="pz-panel__head">
              <span className="pz-eyebrow">Entrada</span>
              <h2 className="pz-panel__title">Campos obligatorios al importar</h2>
              <p className="pz-panel__sub">
                Las filas que no traigan estos campos se rechazan y se listan al
                terminar la carga.
              </p>
            </div>
            <div className="pz-panel__body">
              <PanelCamposImport />
            </div>
          </section>
        </div>

        <div className="col-12 col-lg-6">
          <section className="pz-panel h-100">
            <div className="pz-panel__head">
              <span className="pz-eyebrow pz-eyebrow--purple">Salida</span>
              <h2 className="pz-panel__title">Campos incluidos al exportar</h2>
              <p className="pz-panel__sub">
                Aplica a las descargas en JSON, CSV y XLSX, individuales y
                múltiples.
              </p>
            </div>
            <div className="pz-panel__body">
              <PanelCamposExport />
            </div>
          </section>
        </div>
      </div>

      {puedeEditar && (
        <div className="pz-panel">
          <div className="pz-panel__body">
            <button
              type="button"
              onClick={restablecerDefaults}
              className="pz-btn pz-btn--ghost pz-btn--block"
            >
              Restablecer valores por defecto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
