"use client";

/**
 * Renderiza un texto clinico resaltando las entidades detectadas por el NER.
 *
 * Los offsets vienen calculados por el backend sobre este mismo texto, asi que
 * se usan tal cual. Si por algun motivo no calzan (texto editado despues de la
 * extraccion), la entidad se descarta en vez de romper el renderizado.
 */

import type { EntidadClinica } from "@/types/interconsulta";
import { CLASES_ENTIDAD } from "./entidadesEstilos";

interface TextoConEntidadesProps {
  texto: string;
  entidades?: EntidadClinica[];
}

export default function TextoConEntidades({
  texto,
  entidades,
}: TextoConEntidadesProps) {
  if (!entidades || entidades.length === 0) {
    return <>{texto}</>;
  }

  const ordenadas = [...entidades].sort((a, b) => a.inicio - b.inicio);
  const partes: React.ReactNode[] = [];
  let posicion = 0;

  ordenadas.forEach((entidad, indice) => {
    const { inicio, fin } = entidad;

    // Defensivo: offsets fuera de rango o solapados con lo ya pintado.
    if (inicio < posicion || fin > texto.length || inicio >= fin) {
      return;
    }

    if (inicio > posicion) {
      partes.push(texto.slice(posicion, inicio));
    }

    const estilo = CLASES_ENTIDAD[entidad.clase];
    partes.push(
      <mark
        key={`${indice}-${inicio}`}
        className={`px-0.5 ${estilo?.marca ?? "bg-[var(--pz-paper-2)]"}`}
        style={{ borderRadius: "2px" }}
        title={`${entidad.clase} · ${Math.round(entidad.score * 100)}%`}
      >
        {texto.slice(inicio, fin)}
      </mark>,
    );
    posicion = fin;
  });

  if (posicion < texto.length) {
    partes.push(texto.slice(posicion));
  }

  return <>{partes}</>;
}
