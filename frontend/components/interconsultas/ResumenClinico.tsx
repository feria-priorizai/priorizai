"use client";

/**
 * Componente de resumen clínico del paciente (HdU03).
 * Muestra de forma ordenada y estructurada:
 * - Diagnósticos previos
 * - Tratamientos activos
 * - Alergias
 * - Atenciones recientes
 * - Factores de riesgo identificados
 *
 * Criterios de aceptación HdU03:
 * - Muestra resumen ordenado y estructurado del historial médico.
 * - Si no hay información suficiente, informa al usuario.
 */

import { useEffect, useState } from "react";
import type { ResumenClinicoPaciente } from "@/types/paciente";
import { obtenerResumenClinico } from "@/services/interconsultas";

interface ResumenClinicoProps {
  pacienteId: string;
}

export default function ResumenClinico({ pacienteId }: ResumenClinicoProps) {
  const [resumen, setResumen] = useState<ResumenClinicoPaciente | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    obtenerResumenClinico(pacienteId).then((data) => {
      setResumen(data);
      setCargando(false);
    });
  }, [pacienteId]);

  if (cargando) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <p className="text-sm text-[var(--text-secondary)]">
          Generando resumen clínico...
        </p>
      </div>
    );
  }

  /* Caso: no se encontró resumen para este paciente */
  if (!resumen) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Resumen clínico
          </h3>
        </div>
        <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
          No se encontró información clínica para este paciente.
        </div>
      </div>
    );
  }

  /* Caso: información insuficiente para generar resumen (criterio HdU03) */
  if (!resumen.informacionSuficiente) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Resumen clínico
          </h3>
        </div>
        <div className="flex flex-col items-center gap-2 px-5 py-8">
          <p className="text-sm font-medium text-[var(--prioridad-media)]">
            Información clínica insuficiente
          </p>
          <p className="text-sm text-[var(--text-muted)] text-center max-w-md">
            No existe historial suficiente para elaborar un resumen automático
            para este paciente. Revise el expediente manualmente.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Resumen clínico
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          {resumen.nombre} — {resumen.rut} — {resumen.edad} años — {resumen.sexo === "M" ? "Masculino" : "Femenino"} — {resumen.prevision}
        </p>
      </div>

      <div className="flex flex-col divide-y divide-[var(--border-light)]">
        {/* Factores de riesgo destacados (HdU08 - esperado) */}
        {resumen.factoresRiesgo.length > 0 && (
          <div className="px-5 py-4">
            <h4 className="mb-2 text-sm font-semibold text-[var(--prioridad-alta)]">
              Factores de riesgo identificados
            </h4>
            <div className="flex flex-wrap gap-2">
              {resumen.factoresRiesgo.map((factor, i) => (
                <span
                  key={i}
                  className="rounded-full bg-[var(--prioridad-alta-bg)] border border-[var(--prioridad-alta-border)] px-2.5 py-1 text-xs font-medium text-[var(--prioridad-alta)]"
                >
                  {factor}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Diagnósticos previos */}
        <div className="px-5 py-4">
          <h4 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Diagnósticos previos
          </h4>
          {resumen.diagnosticosPrevios.length > 0 ? (
            <div className="flex flex-col gap-2">
              {resumen.diagnosticosPrevios.map((dx, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-[var(--background)] px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {dx.nombre}
                    </span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      ({dx.codigo})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      {dx.fecha}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        dx.activo ? "bg-[var(--prioridad-baja)]" : "bg-[var(--text-muted)]"
                      }`}
                      title={dx.activo ? "Activo" : "Resuelto"}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Sin diagnósticos previos registrados.
            </p>
          )}
        </div>

        {/* Tratamientos activos */}
        <div className="px-5 py-4">
          <h4 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Tratamientos activos
          </h4>
          {resumen.tratamientos.filter((t) => t.activo).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)]">
                    <th className="pb-2 pr-4 font-medium">Medicamento</th>
                    <th className="pb-2 pr-4 font-medium">Dosis</th>
                    <th className="pb-2 pr-4 font-medium">Frecuencia</th>
                    <th className="pb-2 font-medium">Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.tratamientos
                    .filter((t) => t.activo)
                    .map((trat, i) => (
                      <tr
                        key={i}
                        className="border-t border-[var(--border-light)]"
                      >
                        <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">
                          {trat.nombre}
                        </td>
                        <td className="py-2 pr-4 text-[var(--text-secondary)]">
                          {trat.dosis}
                        </td>
                        <td className="py-2 pr-4 text-[var(--text-secondary)]">
                          {trat.frecuencia}
                        </td>
                        <td className="py-2 text-[var(--text-muted)]">
                          {trat.fechaInicio}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Sin tratamientos activos registrados.
            </p>
          )}
        </div>

        {/* Alergias */}
        <div className="px-5 py-4">
          <h4 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Alergias
          </h4>
          {resumen.alergias.length > 0 ? (
            <div className="flex flex-col gap-2">
              {resumen.alergias.map((alergia, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-[var(--prioridad-media-bg)] px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {alergia.sustancia}
                    </span>
                    <span className="ml-2 text-xs text-[var(--text-secondary)]">
                      — {alergia.reaccion}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      alergia.severidad === "severa"
                        ? "text-[var(--prioridad-alta)]"
                        : alergia.severidad === "moderada"
                          ? "text-[var(--prioridad-media)]"
                          : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {alergia.severidad.charAt(0).toUpperCase() +
                      alergia.severidad.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Sin alergias conocidas.
            </p>
          )}
        </div>

        {/* Atenciones recientes */}
        <div className="px-5 py-4">
          <h4 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Atenciones recientes
          </h4>
          {resumen.atencionesRecientes.length > 0 ? (
            <div className="flex flex-col gap-3">
              {resumen.atencionesRecientes.map((atencion, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-[var(--background)] px-3 py-3"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {atencion.tipo}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        — {atencion.especialidad}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">
                      {atencion.fecha}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {atencion.resumen}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              Sin atenciones recientes registradas.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
