import type { ReactNode } from "react";

interface TarjetaEstadisticaProps {
  titulo: string;
  valor: number | string;
  icono: ReactNode;
  /** Color del acento: filete superior, icono y cifra. */
  acento?: string;
  acentoFondo?: string;
}

/**
 * Indicador del resumen. El icono y el titulo comparten la primera linea; la
 * cifra manda debajo. Todas las tarjetas ocupan el mismo ancho, asi que lo
 * unico que las diferencia es el numero.
 */
export default function TarjetaEstadistica({
  titulo,
  valor,
  icono,
  acento = "var(--pz-blue-deep)",
  acentoFondo = "var(--pz-paper-2)",
}: TarjetaEstadisticaProps) {
  return (
    <div
      className="pz-rail__item"
      style={
        {
          "--pz-acento": acento,
          "--pz-acento-bg": acentoFondo,
        } as React.CSSProperties
      }
    >
      <div className="pz-rail__cabecera">
        <span className="pz-rail__icono" aria-hidden="true">
          {icono}
        </span>
        <span className="pz-rail__t">{titulo}</span>
      </div>
      <span className="pz-num pz-num--lg" style={{ color: acento }}>
        {valor}
      </span>
    </div>
  );
}
