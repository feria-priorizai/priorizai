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
      </div>

      <div className="grid grid-cols-1 gap-0 divide-y divide-[var(--border-light)]">
        <SeccionClinica
          titulo="Historia clinica"
          contenido={campos.historiaClinica}
          textoVacio="Sin historia clinica registrada."
        />
        <SeccionClinica
          titulo="Fundamentos diagnosticos"
          contenido={campos.fundamentosDiagnostico}
          textoVacio="Sin fundamentos diagnosticos registrados."
        />
        <SeccionClinica
          titulo="Examenes complementarios"
          contenido={campos.examenesComplementarios}
          textoVacio="Sin examenes complementarios registrados."
        />
        <SeccionClinica
          titulo="Motivo de interconsulta"
          contenido={campos.motivoInterconsulta}
          textoVacio="Sin motivo de interconsulta registrado."
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

function SeccionClinica({
  titulo,
  contenido,
  textoVacio,
}: SeccionClinicaProps) {
  const texto = contenido?.trim();

  return (
    <section className="px-5 py-4">
      <h4 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
        {titulo}
      </h4>
      {texto ? (
        <p className="whitespace-pre-wrap rounded-lg bg-[var(--background)] p-3 text-sm leading-relaxed text-[var(--text-primary)]">
          {texto}
        </p>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{textoVacio}</p>
      )}
    </section>
  );
}
