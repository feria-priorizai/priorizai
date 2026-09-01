"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ResumenClinicoPaciente } from "@/types/paciente";
import type { EntidadClinica, EntidadesPorCampo } from "@/types/interconsulta";
import { obtenerResumenClinico } from "@/services/interconsultas";
import TextoConEntidades from "./TextoConEntidades";
import { CLASES_ENTIDAD, ORDEN_CLASES } from "./entidadesEstilos";

interface ResumenClinicoProps {
  pacienteId: string;
  /** Entidades detectadas por el NER, para resaltarlas en el texto. */
  entidades?: EntidadesPorCampo | null;
}

interface SeccionClinicaProps {
  titulo: string;
  contenido?: string;
  textoVacio: string;
  entidades?: EntidadClinica[];
}

export default function ResumenClinico({
  pacienteId,
  entidades,
}: ResumenClinicoProps) {
  const [resultado, setResultado] = useState<{
    pacienteId: string;
    resumen: ResumenClinicoPaciente | null;
  } | null>(null);

  useEffect(() => {
    let activo = true;

    obtenerResumenClinico(pacienteId).then((data) => {
      if (activo) {
        setResultado({ pacienteId, resumen: data });
      }
    });

    return () => {
      activo = false;
    };
  }, [pacienteId]);

  const cargando = resultado?.pacienteId !== pacienteId;
  const resumen = resultado?.resumen ?? null;

  if (cargando) {
    return (
      <ContenedorResumen>
        <div className="p-5">
          <p className="text-sm text-[var(--text-secondary)]">
            Cargando antecedentes clinicos...
          </p>
        </div>
      </ContenedorResumen>
    );
  }

  if (!resumen) {
    return (
      <ContenedorResumen titulo="Resumen clinico">
        <EstadoVacio texto="No se encontro informacion clinica para esta interconsulta." />
      </ContenedorResumen>
    );
  }

  if (!resumen.informacionSuficiente || !resumen.camposInterconsulta) {
    return (
      <ContenedorResumen titulo="Resumen clinico">
        <div className="flex flex-col items-center gap-2 px-5 py-8">
          <p className="text-sm font-medium text-[var(--prioridad-media)]">
            Informacion clinica insuficiente
          </p>
          <p className="max-w-md text-center text-sm text-[var(--text-muted)]">
            No existe informacion suficiente en la interconsulta para elaborar
            un resumen clinico. Revise el expediente manualmente.
          </p>
        </div>
      </ContenedorResumen>
    );
  }

  const campos = resumen.camposInterconsulta;

  return (
    <ContenedorResumen titulo="Resumen clinico disponible">
      <div className="border-b border-[var(--border-light)] px-5 py-3">
        <p className="text-sm text-[var(--text-secondary)]">
          Resumen construido con los antecedentes disponibles en la
          interconsulta. No reemplaza el expediente clinico completo.
        </p>
        <LeyendaEntidades entidades={entidades} />
      </div>

      <div className="grid grid-cols-1 gap-0 divide-y divide-[var(--border-light)]">
        <SeccionClinica
          titulo="Historia clinica"
          contenido={campos.historiaClinica}
          textoVacio="Sin historia clinica registrada."
          entidades={entidades?.historia_clinica}
        />
        <SeccionClinica
          titulo="Fundamentos diagnosticos"
          contenido={campos.fundamentosDiagnostico}
          textoVacio="Sin fundamentos diagnosticos registrados."
          entidades={entidades?.fundamentos_diagnostico}
        />
        <SeccionClinica
          titulo="Examenes complementarios"
          contenido={campos.examenesComplementarios}
          textoVacio="Sin examenes complementarios registrados."
          entidades={entidades?.examenes_complementarios}
        />
        <SeccionClinica
          titulo="Motivo de interconsulta"
          contenido={campos.motivoInterconsulta}
          textoVacio="Sin motivo de interconsulta registrado."
          entidades={entidades?.motivo_interconsulta}
        />
      </div>
    </ContenedorResumen>
  );
}

function ContenedorResumen({
  titulo,
  children,
}: {
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      {titulo && (
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {titulo}
          </h3>
        </div>
      )}
      {children}
    </div>
  );
}

function EstadoVacio({ texto }: { texto: string }) {
  return (
    <div className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
      {texto}
    </div>
  );
}

function LeyendaEntidades({
  entidades,
}: {
  entidades?: EntidadesPorCampo | null;
}) {
  const presentes = new Set(
    Object.values(entidades ?? {})
      .flat()
      .map((entidad) => entidad?.clase)
      .filter(Boolean),
  );
  const clases = ORDEN_CLASES.filter((clase) => presentes.has(clase));

  if (clases.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {clases.map((clase) => (
        <li
          key={clase}
          className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"
        >
          <span
            className={`h-2 w-2 rounded-full ${CLASES_ENTIDAD[clase].punto}`}
            aria-hidden
          />
          {CLASES_ENTIDAD[clase].plural}
        </li>
      ))}
    </ul>
  );
}

function SeccionClinica({
  titulo,
  contenido,
  textoVacio,
  entidades,
}: SeccionClinicaProps) {
  const texto = contenido?.trim();

  return (
    <section className="px-5 py-4">
      <h4 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
        {titulo}
      </h4>
      {texto ? (
        <p className="whitespace-pre-wrap rounded-lg bg-[var(--background)] p-3 text-sm leading-relaxed text-[var(--text-primary)]">
          <TextoConEntidades texto={texto} entidades={entidades} />
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{textoVacio}</p>
      )}
    </section>
  );
}
