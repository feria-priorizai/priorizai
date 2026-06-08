"use client";

/**
 * Tabla con las interconsultas más recientes del dashboard.
 * Muestra un resumen rápido con nombre, prioridad, estado y fecha.
 * Al hacer clic en una fila, navega al detalle de la interconsulta.
 *
 * Relacionado con HdU05: visualizar carga de trabajo.
 * Relacionado con HdU06: orden por prioridad y fecha (esperado).
 */

import Link from "next/link";
import type { Interconsulta } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import BadgeEstado from "@/components/ui/BadgeEstado";

interface TablaInterconsultasRecientesProps {
  interconsultas: Interconsulta[];
}

/** Formatea una fecha ISO a formato legible chileno (dd/mm/aaaa HH:mm) */
function formatearFecha(fechaISO: string): string {
  const fecha = new Date(fechaISO);
  return fecha.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TablaInterconsultasRecientes({
  interconsultas,
}: TablaInterconsultasRecientesProps) {
  /** Ordena por prioridad (alta > media > baja) y luego por fecha de ingreso */
  const ordenPrioridad = { alta: 0, media: 1, baja: 2 };
  const ordenadas = [...interconsultas].sort((a, b) => {
    const difPrioridad =
      ordenPrioridad[a.prioridadActual] - ordenPrioridad[b.prioridadActual];
    if (difPrioridad !== 0) return difPrioridad;
    return new Date(b.fechaIngreso).getTime() - new Date(a.fechaIngreso).getTime();
  });

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">
          Interconsultas recientes
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Ordenadas por prioridad y fecha de ingreso
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Paciente
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                RUT
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Diagnóstico
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Prioridad
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Estado
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Confianza IA
              </th>
              <th className="px-5 py-3 font-medium text-[var(--text-secondary)]">
                Fecha ingreso
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((ic) => (
              <tr
                key={ic.id}
                className="border-b border-[var(--border-light)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/interconsultas/${ic.id}`}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    {ic.pacienteNombre}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[var(--text-secondary)]">
                  {ic.pacienteRut}
                </td>
                <td className="max-w-[200px] truncate px-5 py-3 text-[var(--text-secondary)]">
                  {ic.diagnostico}
                </td>
                <td className="px-5 py-3">
                  <BadgePrioridad prioridad={ic.prioridadActual} />
                </td>
                <td className="px-5 py-3">
                  <BadgeEstado estado={ic.estado} />
                </td>
                <td className="px-5 py-3">
                  <span className="text-sm font-semibold">
                    {ic.priorizacionIA.confianza}%
                  </span>
                </td>
                <td className="px-5 py-3 text-[var(--text-secondary)]">
                  {formatearFecha(ic.fechaIngreso)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ordenadas.length === 0 && (
        <div className="px-5 py-12 text-center text-[var(--text-muted)]">
          No se encontraron interconsultas.
        </div>
      )}
    </div>
  );
}
