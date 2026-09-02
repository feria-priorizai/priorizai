"use client";

import type { ReactNode } from "react";
import type { EntidadClinica, EntidadesPorCampo, Interconsulta } from "@/types/interconsulta";
import TextoConEntidades from "./TextoConEntidades";
import { CLASES_ENTIDAD, ORDEN_CLASES } from "./entidadesEstilos";

interface ResumenClinicoProps {
  /** La interconsulta ya cargada por la pagina: trae los cuatro campos
   *  clinicos, asi que no hay que volver a pedirla al backend. */
  interconsulta: Interconsulta;
}

interface SeccionClinicaProps {
  titulo: string;
  contenido?: string | null;
  textoVacio: string;
  entidades?: EntidadClinica[];
}

/**
 * Antecedentes clinicos de la interconsulta, con las entidades del NER
 * resaltadas sobre el texto.
 */
export default function ResumenClinico({
  interconsulta: ic,
}: ResumenClinicoProps) {
  const entidades = ic.entidades;

  // Misma regla que usa el backend para decidir si la IC es priorizable: si no
  // hay ningun antecedente utilizable, tampoco hay resumen que mostrar.
  if (ic.esValidaParaPriorizacion === false) {
    return (
      <Contenedor entidades={entidades}>
        <div className="px-[1.15rem] py-8 text-center">
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

  return (
    <Contenedor entidades={entidades}>
      <SeccionClinica
        titulo="Historia clínica"
        contenido={ic.historiaClinica}
        textoVacio="Sin historia clínica registrada."
        entidades={entidades?.historia_clinica}
      />
      <SeccionClinica
        titulo="Fundamentos diagnósticos"
        contenido={ic.fundamentosDiagnostico}
        textoVacio="Sin fundamentos diagnósticos registrados."
        entidades={entidades?.fundamentos_diagnostico}
      />
      <SeccionClinica
        titulo="Exámenes complementarios"
        contenido={ic.examenesComplementarios}
        textoVacio="Sin exámenes complementarios registrados."
        entidades={entidades?.examenes_complementarios}
      />
      <SeccionClinica
        titulo="Motivo de interconsulta"
        contenido={ic.motivoInterconsulta}
        textoVacio="Sin motivo de interconsulta registrado."
        entidades={entidades?.motivo_interconsulta}
      />
    </Contenedor>
  );
}

function Contenedor({
  children,
  entidades,
}: {
  children: ReactNode;
  entidades?: EntidadesPorCampo | null;
}) {
  return (
    <div className="pz-panel">
      <div className="pz-panel__head">
        <span className="pz-eyebrow pz-eyebrow--green">Antecedentes</span>
        <h2 className="pz-panel__title">Resumen clínico</h2>
        <p className="pz-panel__sub">
          Construido con los campos de la interconsulta. No reemplaza el
          expediente clínico completo.
        </p>
        <LeyendaEntidades entidades={entidades} />
      </div>
      {children}
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
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {clases.map((clase) => (
        <li key={clase} className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 flex-none ${CLASES_ENTIDAD[clase].punto}`}
            aria-hidden="true"
          />
          <span className="pz-label">{CLASES_ENTIDAD[clase].plural}</span>
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
        <p
          className="mt-2 p-3 text-[.9rem] leading-relaxed whitespace-pre-wrap text-[var(--pz-ink)]"
          style={{
            background: "var(--pz-paper-2)",
            borderLeft: "2px solid var(--pz-line-2)",
          }}
        >
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
