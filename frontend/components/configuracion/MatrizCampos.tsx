"use client";

import { useConfiguracion } from "@/context/ConfiguracionContext";
import {
  useConfiguracionExport,
  useConfiguracionImport,
} from "@/hooks/useConfiguracionCampos";
import { TODOS_LOS_CAMPOS } from "@/types/campos";
import type { DefinicionCampo, GrupoCampo } from "@/types/campos";
import { IconoGrupo } from "./iconos";

interface Grupo {
  clave: GrupoCampo;
  titulo: string;
  descripcion: string;
  acento: string;
  acentoFondo: string;
}

const GRUPOS: Grupo[] = [
  {
    clave: "paciente",
    titulo: "Datos del paciente",
    descripcion: "Lo que identifica a quién se deriva.",
    acento: "var(--pz-blue-deep)",
    acentoFondo: "var(--primary-light)",
  },
  {
    clave: "clinico",
    titulo: "Información clínica",
    descripcion: "El texto que lee el modelo para priorizar.",
    acento: "var(--pz-green-ink)",
    acentoFondo: "var(--pz-baja-bg)",
  },
  {
    clave: "priorizacion",
    titulo: "Priorización",
    descripcion: "Lo que decide el sistema. No viene en el archivo.",
    acento: "var(--pz-alta)",
    acentoFondo: "var(--pz-alta-bg)",
  },
  {
    clave: "metadatos",
    titulo: "Metadatos",
    descripcion: "Trazabilidad: folio, estado y fechas.",
    acento: "var(--pz-purple-ink)",
    acentoFondo: "#EAE2FB",
  },
];

/** Solo los campos que vienen en el archivo pueden exigirse al importar; los de
 *  priorización y metadatos los produce el sistema. */
const GRUPOS_IMPORTABLES: GrupoCampo[] = ["paciente", "clinico"];

function esImportable(campo: DefinicionCampo): boolean {
  return GRUPOS_IMPORTABLES.includes(campo.grupo);
}

const IMPORTABLES = TODOS_LOS_CAMPOS.filter(esImportable);

/**
 * Configuración de campos: una tarjeta por grupo, y en cada fila los dos
 * interruptores que deciden si el campo se exige al importar y si viaja en las
 * descargas.
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

  const todosImport = IMPORTABLES.every((c) =>
    camposObligatorios.includes(c.clave),
  );
  const todosExport = TODOS_LOS_CAMPOS.every((c) =>
    camposExport.includes(c.clave),
  );
  const pctImport = Math.round(
    (camposObligatorios.length / IMPORTABLES.length) * 100,
  );
  const pctExport = Math.round(
    (camposExport.length / TODOS_LOS_CAMPOS.length) * 100,
  );

  return (
    <div className="flex flex-col gap-7">
      {/* Qué está configurado hoy, y las acciones que aplican a todo */}
      <section className="pz-panel">
        <div className="pz-panel__head">
          <span className="pz-eyebrow">Campos</span>
          <h2 className="pz-panel__title">Importación y exportación</h2>
          <p className="pz-panel__sub">
            Elegí qué campos exige el archivo de entrada y cuáles viajan en las
            descargas JSON, CSV y XLSX.
          </p>
        </div>

        <div className="pz-panel__body">
          <div className="row g-4">
            <div className="col-12 col-lg-4">
              <Medidor
                etiqueta="Exigidos al importar"
                valor={camposObligatorios.length}
                total={IMPORTABLES.length}
                porcentaje={pctImport}
                color="var(--pz-blue-deep)"
              />
            </div>
            <div className="col-12 col-lg-4">
              <Medidor
                etiqueta="Incluidos al exportar"
                valor={camposExport.length}
                total={TODOS_LOS_CAMPOS.length}
                porcentaje={pctExport}
                color="var(--pz-purple-ink)"
              />
            </div>
            <div className="col-12 col-lg-4">
              <span className="pz-label mb-2">Sesión</span>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="font-semibold"
                  style={{ fontSize: "var(--fs-md)", color: "var(--pz-ink)" }}
                >
                  {usuario?.nombre ?? "Usuario"}
                </span>
                <span
                  className={`pz-chip ${
                    usuario?.rol === "admin" ? "pz-chip--ink" : "pz-chip--baja"
                  }`}
                >
                  {usuario?.rol ?? "médico"}
                </span>
              </div>
              {!puedeEditar && (
                <p className="pz-label mt-2">
                  Solo lectura · contactá al administrador
                </p>
              )}
            </div>
          </div>

          {puedeEditar && (
            <div
              className="mt-4 flex flex-wrap gap-2 pt-4"
              style={{ borderTop: "2px solid var(--pz-line)" }}
            >
              <button
                type="button"
                onClick={() =>
                  setObligatorios(todosImport ? [] : IMPORTABLES.map((c) => c.clave))
                }
                className="pz-btn pz-btn--azul"
              >
                {todosImport ? "No exigir ninguno" : "Exigir todos al importar"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setExportables(
                    todosExport ? [] : TODOS_LOS_CAMPOS.map((c) => c.clave),
                  )
                }
                className="pz-btn pz-btn--morado"
              >
                {todosExport ? "No exportar ninguno" : "Exportar todos"}
              </button>
              <button
                type="button"
                onClick={restablecerDefaults}
                className="pz-btn pz-btn--claro ms-auto"
              >
                Restablecer por defecto
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Una tarjeta por grupo: las secciones se leen separadas de verdad */}
      <div className="row g-4">
        {GRUPOS.map((grupo) => {
          const campos = TODOS_LOS_CAMPOS.filter((c) => c.grupo === grupo.clave);
          if (campos.length === 0) return null;

          return (
            <div key={grupo.clave} className="col-12 col-xl-6">
              <section
                className="pz-grupo-campos"
                style={
                  {
                    "--pz-acento": grupo.acento,
                    "--pz-acento-bg": grupo.acentoFondo,
                  } as React.CSSProperties
                }
              >
                <div className="pz-grupo-campos__head">
                  <span className="pz-grupo-campos__icono" aria-hidden="true">
                    <IconoGrupo tipo={grupo.clave} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="pz-grupo-campos__t">{grupo.titulo}</h3>
                    <p
                      className="mb-0"
                      style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-2)" }}
                    >
                      {grupo.descripcion}
                    </p>
                  </div>
                  <span className="pz-chip pz-chip--neutral">
                    {campos.length}
                  </span>
                </div>

                {/* Cabecera de columnas: qué significa cada interruptor */}
                <div
                  className="pz-campo"
                  style={{ borderTop: 0, background: "var(--pz-paper-2)" }}
                >
                  <span className="pz-campo__nombre pz-label">Campo</span>
                  <span className="pz-campo__sw pz-label text-center">
                    Exigir
                  </span>
                  <span className="pz-campo__sw pz-label text-center">
                    Exportar
                  </span>
                </div>

                {campos.map((campo) => {
                  const importable = esImportable(campo);
                  return (
                    <div key={campo.clave} className="pz-campo">
                      <div className="pz-campo__nombre">
                        <span
                          className="font-semibold"
                          style={{
                            fontSize: "var(--fs-base)",
                            color: "var(--pz-ink)",
                          }}
                        >
                          {campo.etiqueta}
                        </span>
                        <span className="pz-mono-cell mt-0.5 block">
                          {campo.clave}
                        </span>
                      </div>

                      <div className="pz-campo__sw">
                        {importable ? (
                          <div className="form-check form-switch form-switch--import m-0">
                            <input
                              type="checkbox"
                              role="switch"
                              className="form-check-input"
                              checked={camposObligatorios.includes(campo.clave)}
                              disabled={!puedeEditar}
                              onChange={() => toggleImport(campo.clave)}
                              aria-label={`Exigir ${campo.etiqueta} al importar`}
                            />
                          </div>
                        ) : (
                          <span
                            className="pz-label"
                            title="Lo produce el sistema, no viene en el archivo"
                          >
                            —
                          </span>
                        )}
                      </div>

                      <div className="pz-campo__sw">
                        <div className="form-check form-switch form-switch--export m-0">
                          <input
                            type="checkbox"
                            role="switch"
                            className="form-check-input"
                            checked={camposExport.includes(campo.clave)}
                            disabled={!puedeEditar}
                            onChange={() => toggleExport(campo.clave)}
                            aria-label={`Exportar ${campo.etiqueta}`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Medidor({
  etiqueta,
  valor,
  total,
  porcentaje,
  color,
}: {
  etiqueta: string;
  valor: number;
  total: number;
  porcentaje: number;
  color: string;
}) {
  return (
    <div>
      <span className="pz-label mb-2">{etiqueta}</span>
      <div className="flex items-baseline gap-2">
        <span className="pz-num" style={{ fontSize: "2.2rem", color }}>
          {valor}
        </span>
        <span className="pz-mono" style={{ color: "var(--pz-ink-3)" }}>
          de {total}
        </span>
      </div>
      <div className="pz-meter mt-2">
        <div
          className="pz-meter__fill"
          style={{ width: `${porcentaje}%`, background: color }}
        />
      </div>
    </div>
  );
}
