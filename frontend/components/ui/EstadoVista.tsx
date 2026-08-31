/**
 * Estado de carga o error de una vista completa, con la retórica de plano:
 * etiqueta mono sobre una regla, sin cajas.
 */

interface EstadoVistaProps {
  tipo: "cargando" | "error";
  texto: string;
}

export default function EstadoVista({ tipo, texto }: EstadoVistaProps) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3">
      <span
        className={`pz-eyebrow ${tipo === "error" ? "pz-eyebrow--alta" : "pz-eyebrow--muted"}`}
      >
        {tipo === "error" ? "Error" : "Cargando"}
      </span>
      <p
        className="text-[.92rem]"
        style={{
          color: tipo === "error" ? "var(--pz-alta)" : "var(--pz-ink-2)",
        }}
      >
        {texto}
      </p>
    </div>
  );
}
