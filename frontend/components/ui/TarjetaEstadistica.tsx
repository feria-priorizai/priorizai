import type { ReactNode } from "react";

interface TarjetaEstadisticaProps {
  titulo: string;
  valor: number | string;
  icono: ReactNode;
  colorAccento?: string;
}

/**
 * Celda del riel de cifras: el número manda, la etiqueta va debajo en mono.
 * Mismo tratamiento que el riel de la landing.
 */
export default function TarjetaEstadistica({
  titulo,
  valor,
  icono,
  colorAccento,
}: TarjetaEstadisticaProps) {
  return (
    <div className="pz-rail__item flex flex-col justify-between gap-3">
      <div
        className="flex h-6 w-6 items-center justify-center"
        style={{ color: colorAccento ?? "var(--pz-ink-3)" }}
        aria-hidden="true"
      >
        {icono}
      </div>
      <div>
        <span
          className="pz-num pz-num--lg"
          style={colorAccento ? { color: colorAccento } : undefined}
        >
          {valor}
        </span>
        <span className="pz-label mt-2">{titulo}</span>
      </div>
    </div>
  );
}
