"use client";

/**
 * Resumen de las entidades clinicas detectadas, agrupadas por clase.
 * Deduplica por texto (sin distinguir mayusculas) manteniendo la primera forma
 * que aparecio: "HTA" y "hta" son la misma entidad.
 */

import type {
  ClaseEntidad,
  EntidadesPorCampo,
} from "@/types/interconsulta";
import { CLASES_ENTIDAD, ORDEN_CLASES } from "./entidadesEstilos";

interface TablaEntidadesProps {
  entidades?: EntidadesPorCampo | null;
  error?: string | null;
}

export default function TablaEntidades({
  entidades,
  error,
}: TablaEntidadesProps) {
  const agrupadas = agruparPorClase(entidades);
  const clasesConDatos = ORDEN_CLASES.filter(
    (clase) => (agrupadas[clase]?.length ?? 0) > 0,
  );
  const total = clasesConDatos.reduce(
    (suma, clase) => suma + (agrupadas[clase]?.length ?? 0),
    0,
  );

  return (
    <div className="pz-panel">
      <div className="pz-panel__head">
        <span className="pz-eyebrow pz-eyebrow--purple">Extracción</span>
        <h2 className="pz-panel__title">Entidades clínicas detectadas</h2>
        <p className="pz-panel__sub">
          {total > 0
            ? `${total} ${total === 1 ? "término" : "términos"} en el texto de la interconsulta`
            : "Términos reconocidos en el texto de la interconsulta"}
        </p>
      </div>

      {error ? (
        <p className="px-[1.15rem] py-6 text-[.88rem] text-[var(--pz-media)]">
          No se pudieron extraer entidades: {error}
        </p>
      ) : clasesConDatos.length === 0 ? (
        <div className="px-[1.15rem] py-8 text-center">
          <span className="pz-label">
            No se detectaron entidades clínicas en esta interconsulta
          </span>
        </div>
      ) : (
        <>
          {clasesConDatos.map((clase) => {
            const estilo = CLASES_ENTIDAD[clase];
            const terminos = agrupadas[clase] ?? [];

            return (
              <section
                key={clase}
                className="flex flex-col gap-2 px-[1.15rem] py-4 sm:flex-row sm:gap-4"
                style={{ borderTop: "1px solid var(--pz-line)" }}
              >
                <div className="flex shrink-0 items-center gap-2 sm:w-40 sm:pt-0.5">
                  <span
                    className={`h-2 w-2 flex-none ${estilo.punto}`}
                    aria-hidden="true"
                  />
                  <span className="pz-label">
                    {estilo.plural} · {terminos.length}
                  </span>
                </div>

                <ul className="flex flex-wrap gap-1.5">
                  {terminos.map((termino) => (
                    <li key={`${clase}-${termino}`}>
                      <span
                        className={`inline-block border px-2 py-0.5 text-[.82rem] ${estilo.chip}`}
                        style={{ borderRadius: "2px" }}
                      >
                        {termino}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <p
            className="px-[1.15rem] py-3 text-[.78rem] text-[var(--pz-ink-3)]"
            style={{ borderTop: "1px solid var(--pz-line)" }}
          >
            Extraídas automáticamente del texto de la interconsulta. El modelo
            no interpreta negaciones: &quot;sin dolor torácico&quot; se detecta
            igual que &quot;dolor torácico&quot;.
          </p>
        </>
      )}
    </div>
  );
}

function agruparPorClase(
  entidades?: EntidadesPorCampo | null,
): Partial<Record<ClaseEntidad, string[]>> {
  const agrupadas: Partial<Record<ClaseEntidad, string[]>> = {};
  if (!entidades) {
    return agrupadas;
  }

  const vistos = new Set<string>();
  for (const lista of Object.values(entidades)) {
    for (const entidad of lista ?? []) {
      const clave = `${entidad.clase}|${entidad.texto.toLowerCase()}`;
      if (vistos.has(clave)) {
        continue;
      }
      vistos.add(clave);
      (agrupadas[entidad.clase] ??= []).push(entidad.texto);
    }
  }
  return agrupadas;
}
