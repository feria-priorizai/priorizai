"use client";

/**
 * Estado del reentrenamiento en curso o del último: avance, log y, al
 * terminar, la comparación de métricas contra el modelo en uso sobre el mismo
 * conjunto de evaluación. Ningún modelo nuevo entra en uso sin "Activar".
 */

import { useEffect, useRef } from "react";
import type { Metricas, Reentrenamiento, VersionModelo } from "@/types/reentrenamiento";
import { formatearFechaHoraChile } from "@/utils/fechas";

const ETIQUETAS_ESTADO: Record<Reentrenamiento["estado"], { texto: string; chip: string }> = {
  en_curso: { texto: "En curso", chip: "pz-chip--media" },
  terminado: { texto: "Terminado", chip: "pz-chip--baja" },
  error: { texto: "Error", chip: "pz-chip--alta" },
  cancelado: { texto: "Cancelado", chip: "pz-chip--neutral" },
};

const METRICAS: { clave: keyof Pick<Metricas, "exactitud" | "f1_macro" | "sensibilidad_alta">; etiqueta: string; ayuda: string }[] = [
  { clave: "exactitud", etiqueta: "Exactitud", ayuda: "Porcentaje de interconsultas con la prioridad correcta." },
  { clave: "f1_macro", etiqueta: "F1 macro", ayuda: "Promedio del F1 de baja, media y alta: no se infla acertando solo la clase más común." },
  {
    clave: "sensibilidad_alta",
    etiqueta: "Sensibilidad prioridad alta",
    ayuda: "De las interconsultas realmente urgentes, cuántas detectó. Es el error más caro.",
  },
];

export function formatearDuracion(segundos: number | null | undefined): string {
  if (segundos == null) return "calculando…";
  const s = Math.max(0, Math.round(segundos));
  const horas = Math.floor(s / 3600);
  const minutos = Math.floor((s % 3600) / 60);
  if (horas > 0) return `${horas} h ${minutos} min`;
  if (minutos > 0) return `${minutos} min`;
  return `${s} s`;
}

function porcentaje(valor: number): string {
  return `${(valor * 100).toFixed(1)}%`;
}

interface Props {
  reentrenamiento: Reentrenamiento;
  versiones: VersionModelo[];
  ocupado: string | null;
  onCancelar: () => void;
  onActivar: (version: VersionModelo) => void;
}

export default function PanelEjecucion({
  reentrenamiento,
  versiones,
  ocupado,
  onCancelar,
  onActivar,
}: Props) {
  const logRef = useRef<HTMLPreElement | null>(null);
  const { estado, progreso } = reentrenamiento;
  const etiqueta = ETIQUETAS_ESTADO[estado];
  const enCurso = estado === "en_curso";

  // El log se sigue solo mientras corre, como una terminal.
  useEffect(() => {
    if (enCurso && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [reentrenamiento.log, enCurso]);

  return (
    <div className="pz-panel__body flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pz-chip ${etiqueta.chip}`} data-testid="estado-reentrenamiento">
          {etiqueta.texto}
        </span>
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-2)" }}>
          {formatearFechaHoraChile(reentrenamiento.created_at)} · {reentrenamiento.iniciado_por} ·{" "}
          {reentrenamiento.dispositivo.toUpperCase()} · {reentrenamiento.n_registros} interconsultas (
          {reentrenamiento.n_evaluacion} para evaluar)
        </span>
      </div>

      {enCurso && (
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span style={{ fontSize: "var(--fs-base)", color: "var(--pz-ink)", fontWeight: 600 }}>
              {progreso?.etapa ?? "Preparando"}
              {progreso?.epoca != null && progreso?.epocas != null && (
                <span style={{ fontWeight: 400, color: "var(--pz-ink-2)" }}>
                  {" "}
                  · época {progreso.epoca} de {progreso.epocas}
                </span>
              )}
            </span>
            <span className="pz-mono" data-testid="porcentaje-avance">
              {(progreso?.porcentaje ?? 0).toFixed(0)}%
            </span>
          </div>
          <div
            className="pz-meter mt-2"
            role="progressbar"
            aria-label="Avance del reentrenamiento"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progreso?.porcentaje ?? 0)}
          >
            <div className="pz-meter__fill" style={{ width: `${progreso?.porcentaje ?? 0}%` }} />
          </div>
          <p className="mt-2 mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
            Transcurrido: {formatearDuracion(progreso?.segundos_transcurridos ?? 0)} · Restante
            aproximado: {formatearDuracion(progreso?.segundos_restantes)}. Mientras tanto, la app
            sigue priorizando con el modelo en uso.
          </p>
          <button
            type="button"
            data-testid="cancelar-reentrenamiento"
            className="pz-btn pz-btn--rojo pz-btn--mini mt-3"
            onClick={onCancelar}
            disabled={ocupado === "cancelar"}
          >
            {ocupado === "cancelar" ? "Cancelando…" : "Cancelar reentrenamiento"}
          </button>
        </div>
      )}

      {reentrenamiento.error && (
        <p
          role="alert"
          className="mb-0 px-3 py-2.5"
          style={{
            fontSize: "var(--fs-sm)",
            borderRadius: "var(--radius-sm)",
            color: estado === "cancelado" ? "var(--pz-ink-2)" : "var(--pz-alta-fuerte)",
            background: estado === "cancelado" ? "var(--pz-paper-2)" : "var(--pz-alta-bg)",
          }}
        >
          {reentrenamiento.error}
        </p>
      )}

      {estado === "terminado" && reentrenamiento.resultados && (
        <Comparacion
          reentrenamiento={reentrenamiento}
          versiones={versiones}
          ocupado={ocupado}
          onActivar={onActivar}
        />
      )}

      {reentrenamiento.log !== undefined && (
        <details open={enCurso || estado === "error"}>
          <summary className="pz-label" style={{ cursor: "pointer" }}>
            Log del proceso
          </summary>
          <pre
            ref={logRef}
            data-testid="log-reentrenamiento"
            className="pz-mono mt-2 mb-0 p-3"
            style={{
              maxHeight: "18rem",
              overflow: "auto",
              fontSize: "var(--fs-micro)",
              background: "var(--pz-night)",
              color: "rgba(226,236,248,.85)",
              borderRadius: "var(--radius-sm)",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {reentrenamiento.log || "Sin salida todavía."}
          </pre>
        </details>
      )}
    </div>
  );
}

function Comparacion({
  reentrenamiento,
  versiones,
  ocupado,
  onActivar,
}: {
  reentrenamiento: Reentrenamiento;
  versiones: VersionModelo[];
  ocupado: string | null;
  onActivar: (version: VersionModelo) => void;
}) {
  const resultados = reentrenamiento.resultados!;
  const actual = resultados.modelo_actual;
  const columnas = resultados.configuraciones;

  const mejorF1 = Math.max(...columnas.map((c) => c.metricas?.f1_macro ?? -1));

  return (
    <div>
      <span className="pz-label mb-1.5">Comparación sobre las mismas {reentrenamiento.n_evaluacion} interconsultas</span>
      <div className="table-responsive">
        <table className="table pz-table mb-0" data-testid="tabla-comparacion">
          <thead>
            <tr>
              <th scope="col">Métrica</th>
              <th scope="col">Modelo en uso</th>
              {columnas.map((c) => (
                <th key={c.indice} scope="col">
                  {columnas.length > 1 ? `Entrenamiento ${c.indice + 1}` : "Modelo nuevo"}
                  {columnas.length > 1 && c.metricas?.f1_macro === mejorF1 && (
                    <span className="pz-chip pz-chip--baja ms-1">mejor F1</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICAS.map((m) => (
              <tr key={m.clave}>
                <th scope="row" title={m.ayuda} style={{ fontWeight: 600, color: "var(--pz-ink)" }}>
                  {m.etiqueta}
                </th>
                <td className="pz-mono-cell">{actual ? porcentaje(actual[m.clave]) : "—"}</td>
                {columnas.map((c) => {
                  const valor = c.metricas?.[m.clave];
                  const diferencia = actual && valor != null ? valor - actual[m.clave] : null;
                  return (
                    <td key={c.indice} className="pz-mono-cell">
                      {valor != null ? porcentaje(valor) : "—"}
                      {diferencia != null && Math.abs(diferencia) >= 0.0005 && (
                        <span
                          className="d-block"
                          style={{
                            fontSize: "var(--fs-micro)",
                            color: diferencia > 0 ? "var(--pz-green-ink)" : "var(--pz-alta)",
                          }}
                        >
                          {diferencia > 0 ? "▲" : "▼"} {(Math.abs(diferencia) * 100).toFixed(1)} pts
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" style={{ fontWeight: 600, color: "var(--pz-ink)" }}>
                Parámetros
              </th>
              <td style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>—</td>
              {columnas.map((c) => (
                <td key={c.indice} style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-2)" }}>
                  {c.parametros.epocas} {c.parametros.epocas === 1 ? "época" : "épocas"} (mejor:{" "}
                  {c.mejor_epoca ?? "—"}), lr{" "}
                  {c.parametros.learning_rate}, batch {c.parametros.batch_size}, largo{" "}
                  {c.parametros.max_length}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" />
              <td />
              {columnas.map((c) => {
                const version = versiones.find((v) => v.id === c.version_id);
                return (
                  <td key={c.indice}>
                    {version?.activa ? (
                      <span className="pz-chip pz-chip--baja">En uso</span>
                    ) : version ? (
                      <button
                        type="button"
                        data-testid={`activar-resultado-${c.indice + 1}`}
                        className="pz-btn pz-btn--verde pz-btn--mini"
                        disabled={ocupado === version.id}
                        onClick={() => onActivar(version)}
                      >
                        {ocupado === version.id ? "Activando…" : "Activar"}
                      </button>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {!actual && (
        <p className="mt-2 mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
          No se pudo evaluar el modelo en uso (sus archivos no estaban disponibles), así que no hay
          contra qué comparar.
        </p>
      )}
    </div>
  );
}
