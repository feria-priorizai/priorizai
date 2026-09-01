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
      <Contenedor>
        <div className="px-5 py-8 text-center">
          <span className="pz-label">Cargando antecedentes clínicos…</span>
        </div>
      </Contenedor>
    );
  }

  if (!resumen) {
    return (
      <Contenedor>
        <div className="px-5 py-8 text-center">
          <span className="pz-label">
            No se encontró información clínica para esta interconsulta
          </span>
        </div>
      </Contenedor>
    );
  }

  if (!resumen.informacionSuficiente || !resumen.camposInterconsulta) {
    return (
      <Contenedor>
        <div className="px-5 py-8 text-center">
          <span className="pz-eyebrow" style={{ color: "var(--pz-media)" }}>
            Información insuficiente
          </span>
          <p className="mx-auto mt-2.5 max-w-md text-[.88rem] text-[var(--pz-ink-2)]">
            La interconsulta no trae antecedentes suficientes para elaborar un
            resumen. Revise el expediente manualmente.
          </p>
        </div>
      </Contenedor>
    );
  }

  const campos = resumen.camposInterconsulta;

  return (
    <Contenedor>
      <div className="border-b border-[var(--border-light)] px-5 py-3">
        <p className="text-sm text-[var(--text-secondary)]">
          Resumen construido con los antecedentes disponibles en la
          interconsulta. No reemplaza el expediente clinico completo.
        </p>
        <LeyendaEntidades entidades={entidades} />
      </div>

      <div className="grid grid-cols-1 gap-0 divide-y divide-[var(--border-light)]">
        <SeccionClinica
          titulo="Historia clínica"
          contenido={campos.historiaClinica}
          textoVacio="Sin historia clinica registrada."
          entidades={entidades?.historia_clinica}
        />
        <SeccionClinica
          titulo="Fundamentos diagnósticos"
          contenido={campos.fundamentosDiagnostico}
          textoVacio="Sin fundamentos diagnosticos registrados."
          entidades={entidades?.fundamentos_diagnostico}
        />
        <SeccionClinica
          titulo="Exámenes complementarios"
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
    </Contenedor>
  );
}

function Contenedor({ children }: { children: ReactNode }) {
  return (
    <div className="pz-panel">
      <div className="pz-panel__head">
        <span className="pz-eyebrow pz-eyebrow--green">Antecedentes</span>
        <h3 className="pz-panel__title">Resumen clínico</h3>
        <p className="pz-panel__sub">
          Construido con los campos de la interconsulta. No reemplaza el
          expediente clínico completo.
        </p>
      </div>
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
    <section
      className="px-[1.15rem] py-4"
      style={{ borderTop: "1px solid var(--pz-line)" }}
    >
      <span className="pz-label">{titulo}</span>
      {texto ? (
        <p className="whitespace-pre-wrap rounded-lg bg-[var(--background)] p-3 text-sm leading-relaxed text-[var(--text-primary)]">
          <TextoConEntidades texto={texto} entidades={entidades} />
        </p>
      ) : (
        <p className="mt-1.5 text-[.85rem] text-[var(--pz-ink-3)]">
          {textoVacio}
        </p>
      )}
    </section>
  );
}
