"use client";

/**
 * Formulario para lanzar un reentrenamiento: dispositivo, modo y de una a tres
 * configuraciones de RoBERTa. "El sistema elige por ti" entrena una sola con
 * los valores por defecto del backend.
 */

import { useState, type FormEvent } from "react";
import DatosEntrenamiento, {
  NIVELES,
  motivoDatos,
} from "@/components/reentrenamiento/DatosEntrenamiento";
import type {
  ArchivoEntrenamiento,
  Dispositivo,
  ParametrosEntrenamiento,
  ResumenReentrenamiento,
  SolicitudReentrenamiento,
  SubidaArchivo,
} from "@/types/reentrenamiento";

interface CampoParametro {
  clave: keyof ParametrosEntrenamiento;
  etiqueta: string;
  ayuda: string;
  min: number;
  max: number;
  paso: number | "any";
}

/** Mismos rangos que valida el backend (schemas/reentrenamiento.py). */
const CAMPOS: CampoParametro[] = [
  { clave: "epocas", etiqueta: "Épocas", ayuda: "Pasadas completas por los datos.", min: 1, max: 30, paso: 1 },
  {
    clave: "learning_rate",
    etiqueta: "Learning rate",
    ayuda: "Tamaño de cada ajuste. Entre 0.00001 y 0.00005 suele funcionar.",
    min: 0.000001,
    max: 0.001,
    paso: "any",
  },
  { clave: "batch_size", etiqueta: "Batch", ayuda: "Interconsultas por paso. Más grande usa más memoria.", min: 1, max: 128, paso: 1 },
  { clave: "max_length", etiqueta: "Largo máximo", ayuda: "Tokens que lee de cada interconsulta (hasta 512).", min: 32, max: 512, paso: 1 },
  { clave: "paciencia", etiqueta: "Paciencia", ayuda: "Épocas sin mejorar antes de detenerse.", min: 1, max: 10, paso: 1 },
];

interface Props {
  resumen: ResumenReentrenamiento;
  archivos: ArchivoEntrenamiento[];
  enviando: boolean;
  onIniciar: (solicitud: SolicitudReentrenamiento) => void;
  onSubirArchivo: (archivo: File) => Promise<SubidaArchivo | null>;
  onEliminarArchivo: (archivo: ArchivoEntrenamiento) => void;
}

export default function FormularioReentrenamiento({
  resumen,
  archivos,
  enviando,
  onIniciar,
  onSubirArchivo,
  onEliminarArchivo,
}: Props) {
  const porDefecto = resumen.parametros_por_defecto;
  const [usarRevisadas, setUsarRevisadas] = useState(true);
  // Un archivo borrado puede quedar aquí: se filtra contra la lista vigente.
  const [elegidos, setElegidos] = useState<string[]>([]);
  const seleccion = elegidos.filter((id) => archivos.some((a) => a.id === id));
  const [dispositivo, setDispositivo] = useState<Dispositivo>(
    resumen.gpu_disponible ? "gpu" : "cpu",
  );
  const [automatico, setAutomatico] = useState(true);
  const [configuraciones, setConfiguraciones] = useState<ParametrosEntrenamiento[]>([
    { ...porDefecto },
  ]);
  const [porcentajeEvaluacion, setPorcentajeEvaluacion] = useState(20);

  const cambiarCantidad = (cantidad: number) =>
    setConfiguraciones((actuales) =>
      Array.from({ length: cantidad }, (_, i) => actuales[i] ?? { ...porDefecto }),
    );

  const cambiarParametro = (
    indice: number,
    clave: keyof ParametrosEntrenamiento,
    valor: number,
  ) =>
    setConfiguraciones((actuales) =>
      actuales.map((config, i) => (i === indice ? { ...config, [clave]: valor } : config)),
    );

  const seleccionar = (id: string, elegido: boolean) =>
    setElegidos((actuales) =>
      elegido ? [...actuales, id] : actuales.filter((actual) => actual !== id),
    );

  const subirArchivo = async (archivo: File) => {
    const resultado = await onSubirArchivo(archivo);
    // Lo recién subido queda elegido: casi siempre se sube para usarlo.
    if (resultado) seleccionar(resultado.archivo.id, true);
    return resultado;
  };

  const fuentes = [
    ...(usarRevisadas ? [resumen.registros_por_clase] : []),
    ...archivos.filter((a) => seleccion.includes(a.id)).map((a) => a.registros_por_clase),
  ];
  const porClase = Object.fromEntries(
    NIVELES.map((nivel) => [nivel, fuentes.reduce((suma, f) => suma + (f[nivel] ?? 0), 0)]),
  );
  const total = NIVELES.reduce((suma, nivel) => suma + porClase[nivel], 0);
  const motivo =
    resumen.bloqueo_general ??
    motivoDatos(porClase, resumen.minimo, resumen.minimo_por_clase, fuentes.length > 0);

  const manejarEnvio = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onIniciar({
      dispositivo,
      automatico,
      porcentaje_evaluacion: porcentajeEvaluacion,
      configuraciones: automatico ? [] : configuraciones,
      usar_revisadas: usarRevisadas,
      archivos: seleccion,
    });
  };

  const bloqueado = motivo !== null || enviando;

  return (
    <form className="pz-form pz-panel__body flex flex-col gap-4" onSubmit={manejarEnvio}>
      <div>
        <span className="pz-label mb-1.5">Datos para entrenar</span>
        <DatosEntrenamiento
          revisadas={resumen.registros_disponibles}
          usarRevisadas={usarRevisadas}
          archivos={archivos}
          seleccion={seleccion}
          deshabilitado={enviando}
          onUsarRevisadas={setUsarRevisadas}
          onSeleccionar={seleccionar}
          onSubir={subirArchivo}
          onEliminar={onEliminarArchivo}
        />
        <p className="mt-3 mb-2" style={{ fontSize: "var(--fs-base)", color: "var(--pz-ink)" }}>
          <strong data-testid="registros-disponibles">{total}</strong> interconsultas para entrenar
          con lo elegido.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {NIVELES.map((nivel) => (
            <span key={nivel} className={`pz-chip pz-chip--${nivel}`}>
              {nivel}: {porClase[nivel]}
            </span>
          ))}
        </div>
        <p className="mt-2 mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
          Mínimo para reentrenar: {resumen.minimo} en total y {resumen.minimo_por_clase} de cada
          prioridad. Si una interconsulta aparece en más de una fuente, se usa una sola vez.
        </p>
      </div>

      {motivo && (
        <p
          role="alert"
          data-testid="motivo-bloqueo"
          className="mb-0 px-3 py-2.5"
          style={{
            fontSize: "var(--fs-sm)",
            borderRadius: "var(--radius-sm)",
            color: "var(--pz-alta-fuerte)",
            background: "var(--pz-alta-bg)",
          }}
        >
          {motivo}
        </p>
      )}

      <div>
        <span className="pz-label mb-1.5">Dónde entrenar</span>
        <div className="pz-seg pz-seg--vistas" style={{ gridTemplateColumns: "repeat(2, 1fr)" }} role="group" aria-label="Dispositivo">
          {(["cpu", "gpu"] as const).map((opcion) => {
            const sinGpu = opcion === "gpu" && !resumen.gpu_disponible;
            return (
              <button
                key={opcion}
                type="button"
                data-testid={`dispositivo-${opcion}`}
                aria-pressed={dispositivo === opcion}
                disabled={sinGpu || enviando}
                title={sinGpu ? "Este servidor no tiene una GPU disponible" : undefined}
                onClick={() => setDispositivo(opcion)}
                className={`pz-seg__op ${dispositivo === opcion ? "is-on" : ""}`}
              >
                {opcion === "cpu" ? "CPU" : "GPU"}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
          {dispositivo === "cpu"
            ? "En CPU funciona en cualquier servidor, pero puede tardar varias horas por configuración."
            : "En GPU tarda minutos. La app sigue priorizando con el modelo actual mientras tanto."}
        </p>
      </div>

      <div>
        <span className="pz-label mb-1.5">Configuración</span>
        <div className="pz-seg pz-seg--vistas" style={{ gridTemplateColumns: "repeat(2, 1fr)" }} role="group" aria-label="Modo">
          <button
            type="button"
            data-testid="modo-automatico"
            aria-pressed={automatico}
            disabled={enviando}
            onClick={() => setAutomatico(true)}
            className={`pz-seg__op ${automatico ? "is-on" : ""}`}
          >
            El sistema elige por ti
          </button>
          <button
            type="button"
            data-testid="modo-manual"
            aria-pressed={!automatico}
            disabled={enviando}
            onClick={() => setAutomatico(false)}
            className={`pz-seg__op ${!automatico ? "is-on" : ""}`}
          >
            Configurar yo
          </button>
        </div>
        <p className="mt-1.5 mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
          {automatico
            ? `Entrena RoBERTa con su capa de clasificación y valores probados: ${porDefecto.epocas} épocas, learning rate ${porDefecto.learning_rate}, batch ${porDefecto.batch_size}.`
            : "Prueba hasta tres configuraciones de RoBERTa y compáralas con el modelo en uso."}
        </p>
      </div>

      {!automatico && (
        <div className="flex flex-col gap-3">
          <div>
            <span className="pz-label mb-1.5">Cuántos entrenamientos</span>
            <div className="pz-seg" role="group" aria-label="Cantidad de entrenamientos">
              {Array.from({ length: resumen.maximo_configuraciones }, (_, i) => i + 1).map(
                (cantidad) => (
                  <button
                    key={cantidad}
                    type="button"
                    data-testid={`cantidad-${cantidad}`}
                    aria-pressed={configuraciones.length === cantidad}
                    disabled={enviando}
                    onClick={() => cambiarCantidad(cantidad)}
                    className={`pz-seg__op ${configuraciones.length === cantidad ? "is-on" : ""}`}
                    style={configuraciones.length === cantidad ? { background: "var(--pz-purple-ink)" } : undefined}
                  >
                    {cantidad}
                  </button>
                ),
              )}
            </div>
          </div>

          {configuraciones.map((config, indice) => (
            <fieldset
              key={indice}
              className="pz-grupo-campos p-3"
              data-testid={`configuracion-${indice + 1}`}
            >
              <legend className="pz-eyebrow pz-eyebrow--purple mb-2 px-1">
                Entrenamiento {indice + 1} · RoBERTa
              </legend>
              <div className="row g-2">
                {CAMPOS.map((campo) => {
                  const id = `config-${indice}-${campo.clave}`;
                  return (
                    <div key={campo.clave} className="col-6">
                      <label htmlFor={id} className="form-label mb-1" title={campo.ayuda}>
                        {campo.etiqueta}
                      </label>
                      <input
                        id={id}
                        type="number"
                        className="form-control"
                        required
                        min={campo.min}
                        max={campo.max}
                        step={campo.paso}
                        disabled={enviando}
                        value={config[campo.clave]}
                        aria-describedby={`${id}-ayuda`}
                        onChange={(e) => cambiarParametro(indice, campo.clave, Number(e.target.value))}
                      />
                      <span id={`${id}-ayuda`} className="sr-only">
                        {campo.ayuda}
                      </span>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <div>
        <label htmlFor="porcentaje-evaluacion" className="form-label">
          Interconsultas apartadas para evaluar: {porcentajeEvaluacion}%
        </label>
        <input
          id="porcentaje-evaluacion"
          type="range"
          className="form-range"
          min={10}
          max={40}
          step={5}
          disabled={enviando}
          value={porcentajeEvaluacion}
          onChange={(e) => setPorcentajeEvaluacion(Number(e.target.value))}
        />
        <p className="mt-1 mb-0" style={{ fontSize: "var(--fs-sm)", color: "var(--pz-ink-3)" }}>
          Ningún modelo las ve al entrenar. Sobre ellas se compara el modelo nuevo con el que está en
          uso.
        </p>
      </div>

      <button
        type="submit"
        data-testid="iniciar-reentrenamiento"
        className="pz-btn pz-btn--verde pz-btn--block"
        disabled={bloqueado}
      >
        {enviando ? "Iniciando…" : "Iniciar reentrenamiento"}
      </button>
      <p className="mb-0 pz-mono" style={{ fontSize: "var(--fs-micro)", color: "var(--pz-ink-3)" }}>
        Modelo base: {resumen.modelo_base}
      </p>
    </form>
  );
}
