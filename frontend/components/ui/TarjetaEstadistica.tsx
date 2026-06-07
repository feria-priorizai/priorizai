/**
 * Tarjeta reutilizable para mostrar métricas en el dashboard.
 * Ej: "Total interconsultas", "Pendientes", "Prioridad alta".
 */

interface TarjetaEstadisticaProps {
  titulo: string;
  valor: number | string;
  /** Icono o emoji representativo (se usa texto por simplicidad en MVP) */
  icono: string;
  /** Color de acento para el valor */
  colorAccento?: string;
}

export default function TarjetaEstadistica({
  titulo,
  valor,
  icono,
  colorAccento,
}: TarjetaEstadisticaProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--primary-light)] text-2xl">
        {icono}
      </div>
      <div>
        <p className="text-sm text-[var(--text-secondary)]">{titulo}</p>
        <p
          className="text-2xl font-bold"
          style={{ color: colorAccento ?? "var(--text-primary)" }}
        >
          {valor}
        </p>
      </div>
    </div>
  );
}
