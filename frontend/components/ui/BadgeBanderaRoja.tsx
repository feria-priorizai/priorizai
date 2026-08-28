/**
 * Badge de bandera roja (RF7 / HU5-c3): senala que el catalogo de terminos de
 * alarma detecto un signo de alarma afirmado en el texto de la interconsulta,
 * y muestra los terminos que la activaron.
 */

interface BadgeBanderaRojaProps {
  /** Nombres clinicos de los terminos, ya resueltos por el backend contra el
   * catalogo (no los ids). */
  terminos: string[];
  tamano?: "sm" | "lg";
}

export default function BadgeBanderaRoja({
  terminos,
  tamano = "sm",
}: BadgeBanderaRojaProps) {
  const estiloTamano =
    tamano === "lg" ? "px-2.5 py-0.5 text-sm" : "px-2 py-0.5 text-xs";
  const etiquetaTerminos = terminos.join(", ");

  return (
    <span
      title={
        etiquetaTerminos
          ? `Bandera roja: ${etiquetaTerminos}`
          : "Bandera roja detectada"
      }
      className={`inline-flex w-fit items-center gap-1 rounded-full border border-[var(--prioridad-alta-border)] bg-[var(--prioridad-alta-bg)] font-semibold leading-tight text-[var(--prioridad-alta)] ${estiloTamano}`}
    >
      <span aria-hidden="true">&#9873;</span>
      Bandera roja
      {etiquetaTerminos && (
        <span className="font-normal text-[var(--prioridad-alta)]">
          - {etiquetaTerminos}
        </span>
      )}
    </span>
  );
}
