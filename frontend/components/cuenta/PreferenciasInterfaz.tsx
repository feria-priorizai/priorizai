"use client";

/**
 * Apariencia de la aplicación: tema, tamaño de letra y modo de interfaz.
 * Cada elección se aplica al tocarla, sin botón de guardar.
 */

import { usePreferencias } from "@/context/PreferenciasContext";
import type { ModoInterfaz, TamanoLetra, Tema } from "@/types/usuario";

interface Opcion<T> {
  valor: T;
  etiqueta: string;
}

const TEMAS: Opcion<Tema | null>[] = [
  { valor: null, etiqueta: "Sistema" },
  { valor: "claro", etiqueta: "Claro" },
  { valor: "oscuro", etiqueta: "Oscuro" },
];

const TAMANOS: Opcion<TamanoLetra>[] = [
  { valor: "normal", etiqueta: "Normal (100 %)" },
  { valor: "grande", etiqueta: "Grande (125 %)" },
  { valor: "muy_grande", etiqueta: "Muy grande (150 %)" },
];

const MODOS: Opcion<ModoInterfaz>[] = [
  { valor: "estandar", etiqueta: "Estándar" },
  { valor: "legacy", etiqueta: "Legacy" },
];

function Selector<T>({
  titulo,
  opciones,
  valor,
  onCambiar,
}: {
  titulo: string;
  opciones: Opcion<T>[];
  valor: T;
  onCambiar: (valor: T) => void;
}) {
  return (
    <div>
      <span className="pz-label mb-2">{titulo}</span>
      <div className="pz-seg pz-seg--vistas" role="group" aria-label={titulo}>
        {opciones.map((opcion) => {
          const elegida = opcion.valor === valor;
          return (
            <button
              key={opcion.etiqueta}
              type="button"
              aria-pressed={elegida}
              className={`pz-seg__op${elegida ? " is-on" : ""}`}
              onClick={() => onCambiar(opcion.valor)}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PreferenciasInterfaz() {
  const { preferencias, cambiarPreferencias, error } = usePreferencias();

  return (
    <div className="flex flex-col gap-[1.25rem]">
      <Selector
        titulo="Tema"
        opciones={TEMAS}
        valor={preferencias.tema}
        onCambiar={(tema) => cambiarPreferencias({ tema })}
      />
      <Selector
        titulo="Tamaño de letra"
        opciones={TAMANOS}
        valor={preferencias.tamano_letra}
        onCambiar={(tamano_letra) => cambiarPreferencias({ tamano_letra })}
      />
      <Selector
        titulo="Interfaz"
        opciones={MODOS}
        valor={preferencias.modo_interfaz}
        onCambiar={(modo_interfaz) => cambiarPreferencias({ modo_interfaz })}
      />
      {error && (
        <p
          role="alert"
          className="mb-0"
          style={{ color: "var(--pz-alta)", fontSize: "var(--fs-sm)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
