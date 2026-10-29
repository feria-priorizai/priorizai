"use client";

/**
 * Versiones del modelo: cuál está en uso, activar o revertir, descargar el
 * .zip para llevarlo a otro servidor y subir uno que venga de otro lado.
 * Abajo, el registro de quién cambió el modelo y cuándo.
 */

import { useRef, useState, type FormEvent } from "react";
import type { CambioModelo, VersionModelo } from "@/types/reentrenamiento";
import { urlDescargaVersion } from "@/services/reentrenamiento";
import { formatearFechaHoraChile } from "@/utils/fechas";

const ORIGENES: Record<VersionModelo["origen"], string> = {
  inicial: "Inicial",
  reentrenamiento: "Reentrenado aquí",
  subido: "Subido",
};

interface Props {
  versiones: VersionModelo[];
  cambios: CambioModelo[];
  ocupado: string | null;
  bloqueadoPorRemoto: boolean;
  onActivar: (version: VersionModelo) => void;
  onSubir: (archivo: File, nombre: string, ordenClases: string) => Promise<boolean>;
}

export default function VersionesModelo({
  versiones,
  cambios,
  ocupado,
  bloqueadoPorRemoto,
  onActivar,
  onSubir,
}: Props) {
  const activa = versiones.find((v) => v.activa);
  const nombres = new Map(versiones.map((v) => [v.id, v.nombre]));

  return (
    <>
      <div className="table-responsive">
        <table className="table pz-table mb-0" data-testid="tabla-versiones">
          <thead>
            <tr>
              <th scope="col">Versión</th>
              <th scope="col">Origen</th>
              <th scope="col">F1 macro</th>
              <th scope="col">Sens. alta</th>
              <th scope="col">Estado</th>
              <th scope="col" className="text-end">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {versiones.map((v) => {
              // Volver a una version anterior a la que esta en uso es revertir.
              const revertir = activa != null && v.created_at < activa.created_at;
              return (
                <tr key={v.id}>
                  <td>
                    <span style={{ color: "var(--pz-ink)", fontWeight: 600 }}>{v.nombre}</span>
                    <span className="d-block" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
                      {formatearFechaHoraChile(v.created_at)}
                      {v.creado_por ? ` · ${v.creado_por}` : ""}
                      {v.n_registros != null ? ` · ${v.n_registros} interconsultas` : ""}
                    </span>
                  </td>
                  <td>{ORIGENES[v.origen] ?? v.origen}</td>
                  <td className="pz-mono-cell">
                    {v.metricas ? `${(v.metricas.f1_macro * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td className="pz-mono-cell">
                    {v.metricas ? `${(v.metricas.sensibilidad_alta * 100).toFixed(1)}%` : "—"}
                  </td>
                  <td>
                    {v.activa ? (
                      <span className="pz-chip pz-chip--baja">En uso</span>
                    ) : !v.disponible ? (
                      <span className="pz-chip pz-chip--alta" title={v.ruta}>
                        Sin archivos
                      </span>
                    ) : (
                      <span className="pz-chip pz-chip--neutral">Guardada</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {!v.activa && (
                        <button
                          type="button"
                          data-testid={`activar-version-${v.id}`}
                          className="pz-btn pz-btn--claro pz-btn--mini"
                          disabled={!v.disponible || bloqueadoPorRemoto || ocupado === v.id}
                          onClick={() => onActivar(v)}
                        >
                          {ocupado === v.id ? "Activando…" : revertir ? "Revertir" : "Activar"}
                        </button>
                      )}
                      {v.disponible && (
                        <a
                          className="pz-btn pz-btn--claro pz-btn--mini"
                          href={urlDescargaVersion(v.id)}
                          download
                          aria-label={`Descargar ${v.nombre}`}
                        >
                          Descargar
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FormularioSubida onSubir={onSubir} subiendo={ocupado === "subir"} />

      <div className="pz-panel__body pt-0">
        <span className="pz-label mb-1.5">Registro de cambios</span>
        {cambios.length === 0 ? (
          <p className="mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
            Todavía nadie ha cambiado el modelo en uso.
          </p>
        ) : (
          <ul className="mb-0 flex flex-col gap-1.5" data-testid="registro-cambios">
            {cambios.map((c) => (
              <li key={c.id} style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-2)" }}>
                <span className="pz-mono">{formatearFechaHoraChile(c.created_at)}</span> ·{" "}
                <strong>{c.usuario}</strong> {c.accion === "revertir" ? "revirtió a" : "activó"}{" "}
                <em>{nombres.get(c.version_id) ?? c.version_id}</em>
                {c.version_anterior_id && (
                  <> (antes: {nombres.get(c.version_anterior_id) ?? c.version_anterior_id})</>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function FormularioSubida({
  onSubir,
  subiendo,
}: {
  onSubir: Props["onSubir"];
  subiendo: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState("");
  const [ordenClases, setOrdenClases] = useState("");

  const manejarEnvio = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!archivo) return;
    const ok = await onSubir(archivo, nombre, ordenClases);
    if (ok) {
      setArchivo(null);
      setNombre("");
      setOrdenClases("");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <form className="pz-form pz-panel__body flex flex-col gap-3" onSubmit={manejarEnvio}>
      <div>
        <span className="pz-label mb-1">Subir un modelo</span>
        <p className="mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
          El .zip que entrega «Descargar» en otro servidor de PriorizAI. Queda guardado sin activar.
          Solo se aceptan pesos .safetensors.
        </p>
      </div>
      <div className="row g-2">
        <div className="col-12 col-md-5">
          <label htmlFor="subir-archivo" className="form-label">
            Archivo .zip
          </label>
          <input
            id="subir-archivo"
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="form-control"
            required
            disabled={subiendo}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="col-12 col-md-4">
          <label htmlFor="subir-nombre" className="form-label">
            Nombre (opcional)
          </label>
          <input
            id="subir-nombre"
            className="form-control"
            maxLength={255}
            disabled={subiendo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="col-12 col-md-3">
          <label htmlFor="subir-orden" className="form-label" title="Solo si el modelo no declara sus clases">
            Orden de clases
          </label>
          <input
            id="subir-orden"
            className="form-control"
            placeholder="baja,media,alta"
            disabled={subiendo}
            value={ordenClases}
            onChange={(e) => setOrdenClases(e.target.value)}
          />
        </div>
      </div>
      <div>
        <button type="submit" className="pz-btn pz-btn--claro" disabled={!archivo || subiendo}>
          {subiendo ? "Subiendo…" : "Subir modelo"}
        </button>
      </div>
    </form>
  );
}
