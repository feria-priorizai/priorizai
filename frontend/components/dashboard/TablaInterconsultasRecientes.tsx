"use client";

import Link from "next/link";
import type { Interconsulta } from "@/types";
import BadgePrioridad from "@/components/ui/BadgePrioridad";
import BadgeBanderaRoja from "@/components/ui/BadgeBanderaRoja";
import BadgeEstado from "@/components/ui/BadgeEstado";
import { formatearFechaHoraChile } from "@/utils/fechas";

interface TablaInterconsultasRecientesProps {
  interconsultas: Interconsulta[];
}

export default function TablaInterconsultasRecientes({
  interconsultas,
}: TablaInterconsultasRecientesProps) {
  // HU3-c1 y c3: el orden lo resuelve el backend (prioridad descendente ->
  // fecha de emision ascendente -> id). No se reordena en el cliente: hacerlo
  // duplicaba el criterio y lo contradecia, ordenando por fecha de ingreso
  // descendente y anulando el orden correcto que ya venia de la API.
  const ordenadas = interconsultas;

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
                Diagnostico
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
                  <div className="flex flex-col items-start gap-1">
                    {ic.esValidaParaPriorizacion === false ? (
                      <span className="text-sm text-[var(--text-muted)]">
                        No aplica
                      </span>
                    ) : ic.sinPrioridad ? (
                      <span className="text-sm text-[var(--text-muted)]">
                        Sin prioridad
                      </span>
                    ) : (
                      <BadgePrioridad prioridad={ic.prioridadActual} />
                    )}
                    {ic.banderaRoja && (
                      <BadgeBanderaRoja terminos={ic.terminosBanderaRoja} />
                    )}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <BadgeEstado estado={ic.estado} />
                </td>
                <td className="px-5 py-3">
                  {ic.esValidaParaPriorizacion === false ? (
                    <span className="inline-flex rounded-full border border-[var(--prioridad-media-border)] bg-[var(--prioridad-media-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--prioridad-media)]">
                      Interconsulta invalida
                    </span>
                  ) : ic.prioridadForzadaPorRegla ? (
                    <span className="text-sm font-semibold text-[var(--prioridad-alta)]">
                      Regla clinica
                    </span>
                  ) : ic.priorizacionIA.priorizada ?? true ? (
                    <span className="text-sm font-semibold">
                      {ic.priorizacionIA.confianza}%
                    </span>
                  ) : (
                    <span
                      className="text-sm text-[var(--text-muted)]"
                      title={ic.motivoSinPrioridad ?? undefined}
                    >
                      Sin priorizar
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-[var(--text-secondary)]">
                  {formatearFechaHoraChile(ic.fechaIngreso)}
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
