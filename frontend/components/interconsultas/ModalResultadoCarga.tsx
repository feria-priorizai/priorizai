"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EVENTO_RESULTADO_CARGA,
  type FilaRechazada,
  type ResultadoCarga,
} from "@/services/interconsultas";

/** Lo que tarda en promedio la explicación de una interconsulta, en la cola
 *  del backend, que las calcula de a una. */
const MINUTOS_POR_EXPLICACION = 3.5;

/**
 * Resumen de cada carga de archivo: cuántas filas se guardaron de cuántas
 * venían, cuántas priorizó el modelo y qué le pasó a cada fila que quedó
 * afuera. Antes solo aparecía cuando había rechazos, y el total quedaba en un
 * aviso del sidebar que con el menú contraído no se veía.
 */
export function ModalResultadoCarga() {
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null);
  const router = useRouter();
  const dialogoRef = useRef<HTMLDivElement | null>(null);
  const cerrarRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const manejar = (e: Event) => {
      setResultado((e as CustomEvent<ResultadoCarga>).detail ?? null);
    };
    window.addEventListener(EVENTO_RESULTADO_CARGA, manejar);
    return () => window.removeEventListener(EVENTO_RESULTADO_CARGA, manejar);
  }, []);

  const abierto = resultado !== null;

  useEffect(() => {
    if (!abierto) {
      return;
    }

    const focoPrevio = document.activeElement as HTMLElement | null;
    cerrarRef.current?.focus();

    // Un diálogo modal tiene que atrapar el foco: sin esto el tabulador se va a
    // la página de atrás, que el lector de pantalla no debería poder alcanzar.
    const manejarTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setResultado(null);
        return;
      }
      if (e.key !== "Tab" || !dialogoRef.current) {
        return;
      }
      const focusables = dialogoRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        return;
      }
      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", manejarTeclado);
    return () => {
      document.removeEventListener("keydown", manejarTeclado);
      focoPrevio?.focus();
    };
  }, [abierto]);

  if (!resultado) return null;

  const cerrar = () => setResultado(null);
  const irALista = () => {
    setResultado(null);
    router.push("/interconsultas");
  };

  return (
    <div
      className="pz-modal-fondo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div
        ref={dialogoRef}
        className="pz-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-resultado-carga"
      >
        {"error" in resultado ? (
          <Cabecera
            tono="alta"
            etiqueta="Carga fallida"
            titulo="No se pudo cargar el archivo"
            detalle={`${resultado.archivo}: ${resultado.error}`}
            cerrarRef={cerrarRef}
            onCerrar={cerrar}
          />
        ) : (
          <ResumenCarga resultado={resultado} cerrarRef={cerrarRef} onCerrar={cerrar} />
        )}

        <div className="pz-panel__body flex flex-wrap justify-end gap-2 pt-0">
          {!("error" in resultado) && resultado.guardadas > 0 && (
            <button type="button" onClick={irALista} className="pz-btn pz-btn--claro">
              Ver lista de espera
            </button>
          )}
          <button type="button" onClick={cerrar} className="pz-btn pz-btn--azul">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

function ResumenCarga({
  resultado,
  cerrarRef,
  onCerrar,
}: {
  resultado: Extract<ResultadoCarga, { guardadas: number }>;
  cerrarRef: React.RefObject<HTMLButtonElement | null>;
  onCerrar: () => void;
}) {
  const { archivo, guardadas, priorizadas, explicaciones, rechazadas } =
    resultado;
  const total = guardadas + rechazadas.length;
  const sinPriorizar = guardadas - priorizadas;

  const titulo =
    guardadas === 0
      ? "No se cargó ninguna interconsulta"
      : rechazadas.length === 0
        ? `Se ${guardadas === 1 ? "cargó" : "cargaron"} ${
            guardadas === 1 ? "la interconsulta" : `las ${guardadas} interconsultas`
          }`
        : `Se ${guardadas === 1 ? "cargó" : "cargaron"} ${guardadas} de ${total} interconsultas`;

  const detalle =
    rechazadas.length === 0
      ? `${archivo}: todas las filas del archivo se guardaron.`
      : `${archivo}: ${rechazadas.length} ${
          rechazadas.length === 1 ? "fila tuvo un problema y no se guardó" : "filas tuvieron problemas y no se guardaron"
        }. Corrígelas en el archivo y vuelve a cargarlas.`;

  const tono = guardadas === 0 ? "alta" : rechazadas.length > 0 ? "media" : "verde";
  const etiqueta =
    guardadas === 0 ? "Carga fallida" : rechazadas.length > 0 ? "Carga parcial" : "Carga completa";

  return (
    <>
      <Cabecera
        tono={tono}
        etiqueta={etiqueta}
        titulo={titulo}
        detalle={detalle}
        cerrarRef={cerrarRef}
        onCerrar={onCerrar}
      />

      <div className="pz-panel__body flex flex-col gap-4">
        <dl className="pz-cifras-carga">
          <Cifra valor={guardadas} etiqueta="Guardadas" tono="verde" />
          <Cifra valor={priorizadas} etiqueta="Priorizadas con IA" />
          <Cifra valor={rechazadas.length} etiqueta="Con problemas" tono={rechazadas.length > 0 ? "alta" : undefined} />
        </dl>

        {sinPriorizar > 0 && (
          <p className="pz-aviso-carga">
            {sinPriorizar === 1
              ? "1 interconsulta guardada quedó sin prioridad sugerida."
              : `${sinPriorizar} interconsultas guardadas quedaron sin prioridad sugerida.`}{" "}
            Aparecen en el grupo «Sin priorizar» y se pueden priorizar desde su detalle.
          </p>
        )}

        {explicaciones > 0 && (
          <p className="pz-aviso-carga pz-aviso-carga--info">
            {explicaciones === 1
              ? "La explicación de la prioridad sugerida se calcula"
              : `Las explicaciones de las ${explicaciones} prioridades sugeridas se calculan`}{" "}
            en segundo plano, de a una (unos{" "}
            {Math.max(1, Math.round(explicaciones * MINUTOS_POR_EXPLICACION))}{" "}
            min). Mientras tanto se puede revisar cada interconsulta: su
            explicación aparece en el detalle cuando está lista.
          </p>
        )}

        {rechazadas.length > 0 && (
          <div>
            <span className="pz-label">Filas que no se guardaron</span>
            <ul className="mt-2 flex flex-col gap-2">
              {rechazadas.map((fila) => (
                <FilaProblema key={fila.fila} fila={fila} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function Cabecera({
  tono,
  etiqueta,
  titulo,
  detalle,
  cerrarRef,
  onCerrar,
}: {
  tono: "alta" | "media" | "verde";
  etiqueta: string;
  titulo: string;
  detalle: string;
  cerrarRef: React.RefObject<HTMLButtonElement | null>;
  onCerrar: () => void;
}) {
  const claseEtiqueta =
    tono === "verde" ? "pz-eyebrow--green" : tono === "alta" ? "pz-eyebrow--alta" : "";
  return (
    <div className="pz-panel__head flex items-start justify-between gap-4">
      <div className="min-w-0">
        <span
          className={`pz-eyebrow ${claseEtiqueta}`}
          style={tono === "media" ? { color: "var(--pz-media)" } : undefined}
        >
          {etiqueta}
        </span>
        <h2 id="titulo-resultado-carga" className="pz-panel__title">
          {titulo}
        </h2>
        <p className="pz-panel__sub break-words">{detalle}</p>
      </div>
      <button
        ref={cerrarRef}
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar"
        className="pz-mono flex-none px-2 py-1 text-[.8rem] text-[var(--pz-ink-3)] hover:text-[var(--pz-ink)]"
      >
        ✕
      </button>
    </div>
  );
}

function Cifra({
  valor,
  etiqueta,
  tono,
}: {
  valor: number;
  etiqueta: string;
  tono?: "verde" | "alta";
}) {
  return (
    <div className={`pz-cifras-carga__item${tono ? ` pz-cifras-carga__item--${tono}` : ""}`}>
      <dt className="pz-label">{etiqueta}</dt>
      <dd className="pz-cifras-carga__n">{valor}</dd>
    </div>
  );
}

/** Nombres de columna del archivo: los motivos que no lo son se muestran como texto. */
const ES_COLUMNA = /^[A-Z0-9_]+$/;

function FilaProblema({ fila }: { fila: FilaRechazada }) {
  const faltantes = fila.campos_faltantes.filter((c) => ES_COLUMNA.test(c));
  const otros = fila.campos_faltantes.filter((c) => !ES_COLUMNA.test(c));
  const destino = fila.datos_raw?.ESPEC_DESTINO;
  const edad = fila.datos_raw?.EDAD;
  // Una edad inválida es justamente el problema de algunas filas: se muestra tal cual vino.
  const textoEdad =
    edad === undefined || edad === null || String(edad).trim() === ""
      ? null
      : /^\d+$/.test(String(edad).trim())
        ? `${edad} años`
        : `edad «${edad}»`;
  const referencia = [destino, textoEdad]
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .join(" · ");

  return (
    <li className="pz-fila-problema">
      <div className="pz-fila-problema__cab">
        <span className="pz-mono font-semibold text-[var(--pz-ink)]">Fila {fila.fila}</span>
        {referencia && <span className="pz-label">{referencia}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {faltantes.length > 0 && (
          <>
            <span className="text-[var(--pz-ink-2)]">
              {faltantes.length === 1 ? "Falta el campo" : "Faltan los campos"}
            </span>
            {faltantes.map((c) => (
              <span key={c} className="pz-chip pz-chip--alta">
                {c}
              </span>
            ))}
          </>
        )}
        {otros.map((motivo) => (
          <span key={motivo} className="text-[var(--pz-ink-2)]">
            {motivo}
          </span>
        ))}
      </div>
    </li>
  );
}
