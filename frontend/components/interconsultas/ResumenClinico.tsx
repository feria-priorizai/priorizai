"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ResumenClinicoPaciente } from "@/types/paciente";
import { obtenerResumenClinico } from "@/services/interconsultas";

interface ResumenClinicoProps {
  pacienteId: string;
}

interface SeccionClinicaProps {
  titulo: string;
  contenido?: string;
  textoVacio: string;
}

export default function ResumenClinico({ pacienteId }: ResumenClinicoProps) {
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
      <div className="flex flex-col">
        <SeccionClinica
          titulo="Historia clínica"
          contenido={campos.historiaClinica}
          textoVacio="Sin historia clínica registrada."
        />
        <SeccionClinica
          titulo="Fundamentos diagnósticos"
          contenido={campos.fundamentosDiagnostico}
          textoVacio="Sin fundamentos diagnósticos registrados."
        />
        <SeccionClinica
          titulo="Exámenes complementarios"
          contenido={campos.examenesComplementarios}
          textoVacio="Sin exámenes complementarios registrados."
        />
        <SeccionClinica
          titulo="Motivo de interconsulta"
          contenido={campos.motivoInterconsulta}
          textoVacio="Sin motivo de interconsulta registrado."
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

function SeccionClinica({
  titulo,
  contenido,
  textoVacio,
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
          className="mt-2 p-3 text-[.88rem] leading-relaxed whitespace-pre-wrap text-[var(--pz-ink)]"
          style={{
            background: "var(--pz-paper-2)",
            borderLeft: "2px solid var(--pz-line-2)",
          }}
        >
          {texto}
        </p>
      ) : (
        <p className="mt-1.5 text-[.85rem] text-[var(--pz-ink-3)]">
          {textoVacio}
        </p>
      )}
    </section>
  );
}
