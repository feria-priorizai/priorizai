"use client";

import { useConfiguracion } from "@/context/ConfiguracionContext";
import {
  useConfiguracionExport,
  useConfiguracionImport,
} from "@/hooks/useConfiguracionCampos";
import { TODOS_LOS_CAMPOS } from "@/types/campos";
import type { DefinicionCampo } from "@/types/campos";
import { IconoGrupo } from "./iconos";

type ClaveGrupo = "paciente" | "clinico" | "priorizacion" | "metadatos";

const GRUPOS: { clave: ClaveGrupo; titulo: string }[] = [
  { clave: "paciente", titulo: "Datos del paciente" },
  { clave: "clinico", titulo: "Información clínica" },
  { clave: "priorizacion", titulo: "Priorización" },
  { clave: "metadatos", titulo: "Metadatos" },
];

/** Solo los campos que vienen en el archivo pueden exigirse al importar; los de
 *  priorización y metadatos los produce el sistema. */
const GRUPOS_IMPORTABLES: ClaveGrupo[] = ["paciente", "clinico"];

function esImportable(campo: DefinicionCampo): boolean {
  return GRUPOS_IMPORTABLES.includes(campo.grupo as ClaveGrupo);
}

const IMPORTABLES = TODOS_LOS_CAMPOS.filter(esImportable);

/**
 * Un campo por fila y dos casillas: obligatorio al importar, incluido al
 * exportar. Antes eran dos listas separadas con los mismos nombres repetidos.
 */
export default function MatrizCampos() {
  const { puedeVer, puedeEditar, restablecerDefaults, usuario } =
    useConfiguracion();
  const { camposObligatorios, toggleCampo: toggleImport, setObligatorios } =
    useConfiguracionImport();
  const { camposExport, toggleCampo: toggleExport, setExportables } =
    useConfiguracionExport();

  if (!puedeVer) {
    return null;
  }

  const todosImport =
    IMPORTABLES.length > 0 &&
    IMPORTABLES.every((c) => camposObligatorios.includes(c.clave));
  const todosExport =
    TODOS_LOS_CAMPOS.length > 0 &&
    TODOS_LOS_CAMPOS.every((c) => camposExport.includes(c.clave));

  return (
    <div className="flex flex-col gap-4">
      {/* Sesión y permisos, en una línea */}
      <div className="pz-barra" style={{ position: "static" }}>
        <span className="pz-label">Sesión</span>
        <span className="text-[.88rem] font-semibold text-[var(--pz-ink)]">
          {usuario?.nombre ?? "Usuario"}
        </span>
        <span
          className={`pz-chip ${
            usuario?.rol === "admin" ? "pz-chip--ink" : "pz-chip--baja"
          }`}
        >
          {usuario?.rol ?? "médico"}
        </span>

        {puedeEditar ? (
          <button
            type="button"
            onClick={restablecerDefaults}
            className="pz-btn pz-btn--ghost pz-btn--mini ms-auto"
          >
            Restablecer por defecto
          </button>
        ) : (
          <span className="pz-label ms-auto">
            Solo lectura · contacte al administrador
          </span>
        )}
      </div>

      <div className="pz-panel">
        <div className="pz-panel__head">
          <span className="pz-eyebrow">Campos</span>
          <h2 className="pz-panel__title">Importación y exportación</h2>
          <p className="pz-panel__sub">
            Marque qué campos exige el archivo de entrada y cuáles viajan en las
            descargas JSON, CSV y XLSX.
          </p>
        </div>

        <div className="custom-scrollbar" style={{ overflowX: "auto" }}>
          <table className="table pz-table align-middle">
            <thead>
              <tr>
                <th scope="col">Campo</th>
                <th scope="col" className="text-center" style={{ width: "11rem" }}>
                  Obligatorio al importar
                </th>
                <th scope="col" className="text-center" style={{ width: "11rem" }}>
                  Incluido al exportar
                </th>
              </tr>
              <tr>
                <td>
                  <span className="pz-label">
                    {camposObligatorios.length} exigidos ·{" "}
                    {camposExport.length} exportados
                  </span>
                </td>
                <td className="text-center">
                  <button
                    type="button"
                    disabled={!puedeEditar}
                    onClick={() =>
                      setObligatorios(
                        todosImport ? [] : IMPORTABLES.map((c) => c.clave),
                      )
                    }
                    className="pz-btn pz-btn--ghost pz-btn--mini"
                  >
                    {todosImport ? "Ninguno" : "Todos"}
                  </button>
                </td>
                <td className="text-center">
                  <button
                    type="button"
                    disabled={!puedeEditar}
                    onClick={() =>
                      setExportables(
                        todosExport ? [] : TODOS_LOS_CAMPOS.map((c) => c.clave),
                      )
                    }
                    className="pz-btn pz-btn--ghost pz-btn--mini"
                  >
                    {todosExport ? "Ninguno" : "Todos"}
                  </button>
                </td>
              </tr>
            </thead>

            {GRUPOS.map((grupo) => {
              const campos = TODOS_LOS_CAMPOS.filter(
                (c) => c.grupo === grupo.clave,
              );
              if (campos.length === 0) return null;

              return (
                <tbody key={grupo.clave}>
                  <tr>
                    <td colSpan={3} style={{ padding: 0 }}>
                      <div className="pz-grupo pz-grupo--sin">
                        <IconoGrupo
                          tipo={grupo.clave}
                          className="h-3.5 w-3.5 flex-none text-[var(--pz-ink-3)]"
                        />
                        <span className="pz-grupo__t">{grupo.titulo}</span>
                        <span className="pz-grupo__regla" aria-hidden="true" />
                      </div>
                    </td>
                  </tr>

                  {campos.map((campo) => {
                    const importable = esImportable(campo);
                    return (
                      <tr key={campo.clave}>
                        <td>
                          <span className="text-[.88rem] font-medium text-[var(--pz-ink)]">
                            {campo.etiqueta}
                          </span>
                          <span className="pz-mono-cell mt-0.5 block">
                            {campo.clave}
                          </span>
                        </td>

                        <td className="text-center">
                          {importable ? (
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={camposObligatorios.includes(campo.clave)}
                              disabled={!puedeEditar}
                              onChange={() => toggleImport(campo.clave)}
                              aria-label={`${campo.etiqueta} obligatorio al importar`}
                            />
                          ) : (
                            <span
                              className="pz-label"
                              title="Lo produce el sistema, no viene en el archivo"
                            >
                              —
                            </span>
                          )}
                        </td>

                        <td className="text-center">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={camposExport.includes(campo.clave)}
                            disabled={!puedeEditar}
                            onChange={() => toggleExport(campo.clave)}
                            aria-label={`${campo.etiqueta} incluido al exportar`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>
    </div>
  );
}
