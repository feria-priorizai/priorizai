import type { ReactNode } from "react";

interface TarjetaEstadisticaProps {
  titulo: string;
  valor: number | string;
  icono: ReactNode;
  acento?: string;
  acentoFondo?: string;
}

/**
 * Indicador del resumen, en una sola franja: icono y titulo a la izquierda,
 * la cifra a la derecha. Todas las tarjetas ocupan el mismo ancho, asi que lo
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
