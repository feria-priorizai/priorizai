"use client";

/**
 * Fuentes de datos del reentrenamiento: las interconsultas revisadas en la app
 * y archivos (.csv, .xlsx o .json) con interconsultas ya priorizadas en otro
 * lado. El administrador marca cuáles usar; los archivos quedan guardados en el
 * servidor para próximos reentrenamientos.
 */

import { useRef, useState } from "react";
import type { ArchivoEntrenamiento, SubidaArchivo } from "@/types/reentrenamiento";
import { formatearFechaHoraChile } from "@/utils/fechas";

export const NIVELES = ["baja", "media", "alta"] as const;

/** Mismas reglas que motivo_bloqueo en el backend. */
export function motivoDatos(
  porClase: Record<string, number>,
  minimo: number,
  minimoPorClase: number,
  haySeleccion: boolean,
): string | null {
  if (!haySeleccion) {
    return "Elige con qué datos entrenar: las interconsultas revisadas en la app, uno o más archivos, o ambos.";
  }
  const total = NIVELES.reduce((suma, nivel) => suma + (porClase[nivel] ?? 0), 0);
  if (total < minimo) {
    return `Hay ${total} interconsultas con prioridad para entrenar y se necesitan al menos ${minimo}.`;
  }
  const escasas = NIVELES.filter((nivel) => (porClase[nivel] ?? 0) < minimoPorClase);
  if (escasas.length > 0) {
    return `Se necesitan al menos ${minimoPorClase} interconsultas de cada prioridad. Faltan de: ${escasas.join(", ")}.`;
  }
  return null;
}

interface Props {
  revisadas: number;
  usarRevisadas: boolean;
  archivos: ArchivoEntrenamiento[];
  seleccion: string[];
  deshabilitado: boolean;
  onUsarRevisadas: (usar: boolean) => void;
  onSeleccionar: (id: string, elegido: boolean) => void;
  onSubir: (archivo: File) => Promise<SubidaArchivo | null>;
  onEliminar: (archivo: ArchivoEntrenamiento) => void;
}

const textoAyuda = { fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" } as const;

export default function DatosEntrenamiento({
  revisadas,
  usarRevisadas,
  archivos,
  seleccion,
  deshabilitado,
  onUsarRevisadas,
  onSeleccionar,
  onSubir,
  onEliminar,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ultimaSubida, setUltimaSubida] = useState<SubidaArchivo | null>(null);

  const subir = async () => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const resultado = await onSubir(archivo);
      if (resultado) {
        setUltimaSubida(resultado);
        setArchivo(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="fuentes-datos">
      <label className="form-check m-0 flex items-start gap-2">
        <input
          type="checkbox"
          className="form-check-input mt-1"
          data-testid="usar-revisadas"
          checked={usarRevisadas}
          disabled={deshabilitado}
          onChange={(e) => onUsarRevisadas(e.target.checked)}
        />
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink)" }}>
          <strong>Revisadas en la app</strong>: {revisadas} interconsultas con prioridad confirmada o
          corregida por un médico.
        </span>
      </label>

      {archivos.map((a) => (
        <div key={a.id} className="flex items-start gap-2" data-testid={`archivo-${a.id}`}>
          <label className="form-check m-0 flex flex-1 items-start gap-2">
            <input
              type="checkbox"
              className="form-check-input mt-1"
              aria-label={`Usar ${a.nombre}`}
              checked={seleccion.includes(a.id)}
              disabled={deshabilitado}
              onChange={(e) => onSeleccionar(a.id, e.target.checked)}
            />
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink)" }}>
              <strong>{a.nombre}</strong>: {a.n_registros} interconsultas
              <span className="d-block" style={textoAyuda}>
                {NIVELES.map((nivel) => `${nivel} ${a.registros_por_clase[nivel] ?? 0}`).join(" · ")}
                {" · "}
                {formatearFechaHoraChile(a.created_at)} · {a.creado_por}
              </span>
            </span>
          </label>
          <button
            type="button"
            className="pz-btn pz-btn--claro pz-btn--mini"
            aria-label={`Borrar ${a.nombre}`}
            disabled={deshabilitado}
            onClick={() => onEliminar(a)}
          >
            Borrar
          </button>
        </div>
      ))}

      <div className="pz-grupo-campos mt-1 p-3">
        <label htmlFor="subir-datos" className="form-label mb-1">
          Agregar un archivo con interconsultas ya priorizadas
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="subir-datos"
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.json"
            className="form-control"
            style={{ flex: "1 1 14rem" }}
            disabled={deshabilitado || subiendo}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            data-testid="subir-datos"
            className="pz-btn pz-btn--claro"
            disabled={!archivo || deshabilitado || subiendo}
            onClick={() => void subir()}
          >
            {subiendo ? "Subiendo…" : "Subir"}
          </button>
        </div>
        <p className="mt-1.5 mb-0" style={textoAyuda}>
          .csv, .xlsx o .json con las columnas de la carga de interconsultas. Obligatorias:
          PRIORIDAD (alta, media o baja) e HISTORIA_CLINICA. Queda guardado en este servidor.
        </p>
        {ultimaSubida && (
          <div role="status" data-testid="resultado-subida-datos" className="mt-2" style={textoAyuda}>
            Se cargaron {ultimaSubida.archivo.n_registros} interconsultas de «
            {ultimaSubida.archivo.nombre}».
            {ultimaSubida.archivo.n_rechazadas > 0 && (
              <>
                {" "}
                {ultimaSubida.archivo.n_rechazadas} filas no se usaron
                {ultimaSubida.rechazadas.length < ultimaSubida.archivo.n_rechazadas
                  ? " (estas son las primeras)"
                  : ""}
                :
                <ul className="mb-0 mt-1 ps-3">
                  {ultimaSubida.rechazadas.map((r) => (
                    <li key={r.fila}>
                      Fila {r.fila}: {r.motivo}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
