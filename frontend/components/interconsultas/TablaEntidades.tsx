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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Entidades clinicas detectadas
        </h3>
        {total > 0 && (
          <span className="text-sm text-[var(--text-muted)]">
            {total} {total === 1 ? "termino" : "terminos"}
          </span>
        )}
      </div>

      {error ? (
        <p className="px-5 py-6 text-sm text-[var(--prioridad-media)]">
          No se pudieron extraer entidades: {error}
        </p>
      ) : clasesConDatos.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[var(--text-muted)]">
          No se detectaron entidades clinicas en esta interconsulta.
        </p>
      ) : (
        <>
          <div className="divide-y divide-[var(--border-light)]">
            {clasesConDatos.map((clase) => {
              const estilo = CLASES_ENTIDAD[clase];
              const terminos = agrupadas[clase] ?? [];

              return (
                <section
                  key={clase}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:gap-4"
                >
                  <div className="flex shrink-0 items-center gap-2 sm:w-40 sm:pt-1">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${estilo.punto}`}
                      aria-hidden
                    />
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                      {estilo.plural}
                    </h4>
                    <span className="text-xs text-[var(--text-muted)]">
                      ({terminos.length})
                    </span>
                  </div>

                  <ul className="flex flex-wrap gap-1.5">
                    {terminos.map((termino) => (
                      <li key={`${clase}-${termino}`}>
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 text-sm ${estilo.chip}`}
                        >
                          {termino}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <p className="border-t border-[var(--border-light)] px-5 py-3 text-xs text-[var(--text-muted)]">
            Extraidas automaticamente del texto de la interconsulta. El modelo
            no interpreta negaciones: &quot;sin dolor toracico&quot; se detecta
            igual que &quot;dolor toracico&quot;.
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
