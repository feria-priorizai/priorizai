/**
 * Bandera roja (RF7 / HU5-c3): el catálogo de términos de alarma detectó un
 * signo afirmado en el texto de la interconsulta. Muestra los términos que la
 * activaron.
 */

interface BadgeBanderaRojaProps {
  /** Nombres clínicos de los términos, ya resueltos por el backend. */
  terminos: string[];
}

export default function BadgeBanderaRoja({ terminos }: BadgeBanderaRojaProps) {
  const etiquetaTerminos = terminos.join(", ");

  return (
    <span
      title={
        etiquetaTerminos
          ? `Bandera roja: ${etiquetaTerminos}`
          : "Bandera roja detectada"
      }
      className="inline-flex w-fit flex-wrap items-center gap-1.5"
    >
      <span className="pz-chip pz-chip--flag">⚑ Bandera roja</span>
      {etiquetaTerminos && (
        <span className="pz-mono text-[.68rem] leading-tight text-[var(--pz-alta)]">
          {etiquetaTerminos}
        </span>
      )}
    </span>
  );
}
