"use client";

/**
 * Módulo de reentrenamiento (solo administradores). Junta el formulario, el
 * estado del entrenamiento en curso o del último, y las versiones del modelo.
 * Mientras hay uno en curso pregunta por su avance cada pocos segundos.
 */

import { useCallback, useEffect, useState } from "react";
import EstadoVista from "@/components/ui/EstadoVista";
import FormularioReentrenamiento from "@/components/reentrenamiento/FormularioReentrenamiento";
import PanelEjecucion from "@/components/reentrenamiento/PanelEjecucion";
import VersionesModelo from "@/components/reentrenamiento/VersionesModelo";
import {
  activarVersion,
  cancelarReentrenamiento,
  eliminarArchivoDatos,
  iniciarReentrenamiento,
  listarArchivosDatos,
  listarCambios,
  listarReentrenamientos,
  listarVersiones,
  obtenerReentrenamiento,
  obtenerResumen,
  subirArchivoDatos,
  subirVersion,
} from "@/services/reentrenamiento";
import type {
  ArchivoEntrenamiento,
  CambioModelo,
  Reentrenamiento,
  ResumenReentrenamiento,
  SolicitudReentrenamiento,
  SubidaArchivo,
  VersionModelo,
} from "@/types/reentrenamiento";

export const INTERVALO_SONDEO_MS = 3000;

interface Aviso {
  tipo: "ok" | "error";
  texto: string;
}

function mensaje(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function ModuloReentrenamiento() {
  const [resumen, setResumen] = useState<ResumenReentrenamiento | null>(null);
  const [actual, setActual] = useState<Reentrenamiento | null>(null);
  const [versiones, setVersiones] = useState<VersionModelo[]>([]);
  const [cambios, setCambios] = useState<CambioModelo[]>([]);
  const [archivos, setArchivos] = useState<ArchivoEntrenamiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(
    () =>
      Promise.all([
        obtenerResumen(),
        listarReentrenamientos(),
        listarVersiones(),
        listarCambios(),
        listarArchivosDatos(),
      ])
        .then(async ([nuevoResumen, trabajos, nuevasVersiones, nuevosCambios, nuevosArchivos]) => {
          // Se muestra el que está en curso o, si no hay, el último.
          const id = nuevoResumen.en_curso_id ?? trabajos[0]?.id ?? null;
          setActual(id ? await obtenerReentrenamiento(id) : null);
          setResumen(nuevoResumen);
          setVersiones(nuevasVersiones);
          setCambios(nuevosCambios);
          setArchivos(nuevosArchivos);
          setErrorCarga(null);
        })
        .catch((error: unknown) => {
          setErrorCarga(mensaje(error, "No se pudo cargar el módulo de reentrenamiento"));
        })
        .finally(() => setCargando(false)),
    [],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const idEnCurso = actual?.estado === "en_curso" ? actual.id : null;

  useEffect(() => {
    if (!idEnCurso) return;
    const intervalo = window.setInterval(async () => {
      try {
        const detalle = await obtenerReentrenamiento(idEnCurso);
        if (detalle.estado === "en_curso") {
          setActual(detalle);
        } else {
          // Terminó: hay versiones nuevas y el formulario vuelve a habilitarse.
          await cargar();
        }
      } catch {
        // Un sondeo fallido no es grave: el siguiente vuelve a intentar.
      }
    }, INTERVALO_SONDEO_MS);
    return () => window.clearInterval(intervalo);
  }, [idEnCurso, cargar]);

  const iniciar = async (solicitud: SolicitudReentrenamiento) => {
    setEnviando(true);
    setAviso(null);
    try {
      const nuevo = await iniciarReentrenamiento(solicitud);
      setActual(nuevo);
      setAviso({
        tipo: nuevo.estado === "error" ? "error" : "ok",
        texto:
          nuevo.estado === "error"
            ? (nuevo.error ?? "El reentrenamiento no pudo empezar.")
            : `Reentrenamiento iniciado con ${nuevo.n_registros} interconsultas. Puedes salir de esta página: sigue corriendo en el servidor.`,
      });
      await cargar();
    } catch (error) {
      setAviso({ tipo: "error", texto: mensaje(error, "No se pudo iniciar el reentrenamiento") });
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async () => {
    if (!actual) return;
    if (!window.confirm("¿Cancelar el reentrenamiento? Lo entrenado hasta ahora se descarta.")) {
      return;
    }
    setOcupado("cancelar");
    try {
      await cancelarReentrenamiento(actual.id);
      setAviso({ tipo: "ok", texto: "Cancelando el reentrenamiento…" });
    } catch (error) {
      setAviso({ tipo: "error", texto: mensaje(error, "No se pudo cancelar") });
    } finally {
      setOcupado(null);
    }
  };

  const activar = async (version: VersionModelo) => {
    const confirmado = window.confirm(
      `¿Usar «${version.nombre}» para priorizar desde ahora? Las interconsultas ya priorizadas no cambian.`,
    );
    if (!confirmado) return;
    setOcupado(version.id);
    setAviso(null);
    try {
      const cambio = await activarVersion(version.id);
      setAviso({
        tipo: "ok",
        texto: `${cambio.accion === "revertir" ? "Se revirtió a" : "Ahora prioriza"} «${version.nombre}». Las próximas interconsultas usan este modelo.`,
      });
      await cargar();
    } catch (error) {
      setAviso({ tipo: "error", texto: mensaje(error, "No se pudo activar la versión") });
    } finally {
      setOcupado(null);
    }
  };

  const subir = async (archivo: File, nombre: string, ordenClases: string): Promise<boolean> => {
    setOcupado("subir");
    setAviso(null);
    try {
      const version = await subirVersion(archivo, { nombre, ordenClases });
      setAviso({ tipo: "ok", texto: `Modelo «${version.nombre}» guardado. Actívalo cuando quieras usarlo.` });
      await cargar();
      return true;
    } catch (error) {
      setAviso({ tipo: "error", texto: mensaje(error, "No se pudo subir el modelo") });
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const subirDatos = async (archivo: File): Promise<SubidaArchivo | null> => {
    setAviso(null);
    try {
      const subida = await subirArchivoDatos(archivo);
      setArchivos(await listarArchivosDatos());
      return subida;
    } catch (error) {
      setAviso({ tipo: "error", texto: mensaje(error, "No se pudo subir el archivo") });
      return null;
    }
  };

  const eliminarDatos = async (archivo: ArchivoEntrenamiento) => {
    if (!window.confirm(`¿Borrar «${archivo.nombre}» de este servidor?`)) return;
    setAviso(null);
    try {
      await eliminarArchivoDatos(archivo.id);
      setArchivos((actuales) => actuales.filter((a) => a.id !== archivo.id));
    } catch (error) {
      setAviso({ tipo: "error", texto: mensaje(error, "No se pudo borrar el archivo") });
    }
  };

  if (cargando) return <EstadoVista tipo="cargando" texto="Cargando reentrenamiento…" />;
  if (errorCarga || !resumen) {
    return <EstadoVista tipo="error" texto={errorCarga ?? "No se pudo cargar el módulo"} />;
  }

  return (
    <div className="row g-4">
      {aviso && (
        <div className="col-12">
          <p
            role={aviso.tipo === "error" ? "alert" : "status"}
            data-testid="aviso-reentrenamiento"
            className="mb-0 px-3 py-2.5"
            style={{
              fontSize: "var(--fs-sm)",
              borderRadius: "var(--radius-sm)",
              color: aviso.tipo === "error" ? "var(--pz-alta-fuerte)" : "var(--pz-green-ink)",
              background: aviso.tipo === "error" ? "var(--pz-alta-bg)" : "var(--pz-baja-bg)",
            }}
          >
            {aviso.texto}
          </p>
        </div>
      )}

      <div className="col-12 col-xl-5">
        <section className="pz-panel" aria-labelledby="titulo-nuevo">
          <div className="pz-panel__head">
            <span className="pz-eyebrow pz-eyebrow--green">Nuevo</span>
            <h2 id="titulo-nuevo" className="pz-panel__title">
              Reentrenar el modelo
            </h2>
            <p className="pz-panel__sub">
              Aprende de las prioridades que los médicos confirmaron o corrigieron, o de archivos con
              interconsultas ya priorizadas, para ajustarse a los criterios del establecimiento.
            </p>
          </div>
          <FormularioReentrenamiento
            resumen={resumen}
            archivos={archivos}
            enviando={enviando}
            onIniciar={(solicitud) => void iniciar(solicitud)}
            onSubirArchivo={subirDatos}
            onEliminarArchivo={(archivo) => void eliminarDatos(archivo)}
          />
        </section>
      </div>

      <div className="col-12 col-xl-7">
        <section className="pz-panel" aria-labelledby="titulo-ejecucion">
          <div className="pz-panel__head">
            <span className="pz-eyebrow">{actual?.estado === "en_curso" ? "En curso" : "Último"}</span>
            <h2 id="titulo-ejecucion" className="pz-panel__title">
              Resultado del reentrenamiento
            </h2>
            <p className="pz-panel__sub">
              El modelo nuevo solo entra en uso si lo activas.
            </p>
          </div>
          {actual ? (
            <PanelEjecucion
              reentrenamiento={actual}
              versiones={versiones}
              ocupado={ocupado}
              onCancelar={() => void cancelar()}
              onActivar={(version) => void activar(version)}
            />
          ) : (
            <p className="pz-panel__body mb-0" style={{ color: "var(--pz-ink-3)" }}>
              Todavía no se ha reentrenado el modelo.
            </p>
          )}
        </section>
      </div>

      <div className="col-12">
        <section className="pz-panel" aria-labelledby="titulo-versiones">
          <div className="pz-panel__head">
            <span className="pz-eyebrow">Versiones</span>
            <h2 id="titulo-versiones" className="pz-panel__title">
              Modelos guardados en este servidor
            </h2>
            <p className="pz-panel__sub">
              Puedes volver a cualquier versión anterior. Para llevar un modelo a otro computador,
              descárgalo aquí y súbelo allá.
            </p>
          </div>
          <VersionesModelo
            versiones={versiones}
            cambios={cambios}
            ocupado={ocupado}
            bloqueadoPorRemoto={resumen.servicio_remoto}
            onActivar={(version) => void activar(version)}
            onSubir={subir}
          />
        </section>
      </div>
    </div>
  );
}
