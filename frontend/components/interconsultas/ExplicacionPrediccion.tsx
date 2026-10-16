"use client";

/**
 * Por qué el modelo sugiere la prioridad que sugiere: cuánto empujó cada campo
 * de la interconsulta hacia esa prioridad o en contra, calculado con SHAP.
 *
 * El mismo cálculo se puede ver de tres formas, y cada médico elige la suya
 * (queda recordada en su navegador):
 * - Resumen: en palabras, qué empujó a favor y qué en contra, y cuánto.
 * - Palabras: el texto de la interconsulta con las palabras que más pesaron
 *   resaltadas. El peso de una palabra es lo que cambia la probabilidad si se
 *   borra solo esa palabra.
 * - Por campo: barras a la derecha (suma) o a la izquierda (resta).
 *
 * Se calcula sola, apenas el modelo prioriza la interconsulta (al cargar el
 * archivo), en segundo plano y de a una. El componente pregunta cada pocos
 * segundos en qué va y muestra el avance real. El botón para pedirla queda
 * para las que no la tienen: cargadas antes de esto, o con un cálculo que
 * falló.
 *
 * Las vistas se acomodan al ancho del panel con container queries (@md,
 * @xl), no al de la pantalla: en escritorio el panel comparte la fila con el
 * de decisión, y en un notebook queda angosto aunque la pantalla no lo sea.
 *
 * Color: morado = a favor de la sugerencia, teal = en contra. Rojo, ámbar y
 * verde quedan fuera a propósito porque en esta interfaz significan prioridad.
 * El color nunca va solo: el sentido también lo dicen el título de cada lista,
 * la dirección de la barra, el signo (+/−) y el subrayado de las palabras
 * (continuo a favor, punteado en contra).
 */

import {
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Interconsulta, NivelPrioridad } from "@/types/interconsulta";
import type {
  AporteCampo,
  CampoModelo,
  EstadoExplicacion,
  ExplicacionShap,
  PalabraAtribuida,
} from "@/types/explicacion";
import {
  consultarExplicacion,
  pedirExplicacion,
} from "@/services/interconsultas";
import { formatearFechaHoraChileLarga } from "@/utils/fechas";
import EstadoVista from "@/components/ui/EstadoVista";

const ETIQUETAS: Record<CampoModelo, string> = {
  espec_origen: "Especialidad de origen",
  edad: "Edad",
  sexo: "Sexo",
  espec_destino: "Especialidad de destino",
  historia_clinica: "Historia clínica",
  fundamentos_diagnostico: "Fundamentos diagnósticos",
  examenes_complementarios: "Exámenes complementarios",
  motivo_interconsulta: "Motivo de interconsulta",
};

type Vista = "resumen" | "palabras" | "campos";

const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: "resumen", etiqueta: "Resumen" },
  { id: "palabras", etiqueta: "Palabras" },
  { id: "campos", etiqueta: "Por campo" },
];

const CLAVE_VISTA = "priorizai:explicacion-vista";

/** Cuánto empujó un campo, en palabras, según los puntos de probabilidad. */
const FUERZAS = [
  { desde: 10, texto: "Mucho", nivel: 3 },
  { desde: 3, texto: "Algo", nivel: 2 },
  { desde: 0, texto: "Poco", nivel: 1 },
] as const;

/** Bajo esta diferencia entre la probabilidad final y la de partida, lo que
 *  dice la interconsulta casi no movió la sugerencia, y se avisa. */
const CAMBIO_PEQUENO = 5;

/** Fracción de cada mitad del eje que puede ocupar la barra más larga: el
 *  resto queda para que la etiqueta del valor no se salga. */
const LARGO_MAXIMO_BARRA = 0.78;

/** Minutos que toma una explicación en CPU, para estimar la espera en cola.
 *  Medido: entre 3 y 4 minutos por interconsulta. */
const MINUTOS_POR_EXPLICACION = 3.5;

/** Cada cuánto se pregunta por el avance mientras se calcula. */
const INTERVALO_CONSULTA_MS = 2500;

const formatoDecimal = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Las probabilidades con los mismos decimales que la confianza del panel de
 *  decisión (69,23%), para que se reconozcan como el mismo número. */
const formatoProbabilidad = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
});

function porcentaje(valor: number): string {
  return `${formatoProbabilidad.format(valor)}%`;
}

/** "+18,5" / "−4,3", con el signo menos tipográfico. Bajo una décima, sin signo. */
function conSigno(valor: number): string {
  const texto = formatoDecimal.format(Math.abs(valor));
  if (Math.abs(valor) < 0.05) return texto;
  return `${valor > 0 ? "+" : "−"}${texto}`;
}

/** 343 → "5 min 43 s"; 42 → "42 s". */
function duracion(segundos: number): string {
  const total = Math.round(segundos);
  const minutos = Math.floor(total / 60);
  if (minutos === 0) return `${total} s`;
  return `${minutos} min ${total % 60} s`;
}

function mayuscula(clase: NivelPrioridad): string {
  return clase.toUpperCase();
}

function fuerza(aporte: number) {
  const valor = Math.abs(aporte);
  return FUERZAS.find((f) => valor >= f.desde) ?? FUERZAS[FUERZAS.length - 1];
}

/** Por qué un campo no aporta, o null si aporta. */
function motivoSinAporte(fila: AporteCampo): string | null {
  if (fila.vacio) return "vacío";
  if (fila.no_leido) return "no leído";
  return null;
}

function sinAporte(fila: AporteCampo): boolean {
  return motivoSinAporte(fila) !== null;
}

/** Los campos que aportan, del que más empujó al que menos. */
function porMagnitud(campos: AporteCampo[]): AporteCampo[] {
  return campos
    .filter((c) => !sinAporte(c))
    .sort((a, b) => Math.abs(b.aporte) - Math.abs(a.aporte));
}

function vistaGuardada(): Vista {
  try {
    const valor = window.localStorage.getItem(CLAVE_VISTA);
    return VISTAS.find((v) => v.id === valor)?.id ?? "resumen";
  } catch {
    return "resumen";
  }
}

function enCurso(estado: EstadoExplicacion | null): boolean {
  return estado?.estado === "en_cola" || estado?.estado === "calculando";
}

function estadoInicial(ic: Interconsulta): EstadoExplicacion | null {
  if (!ic.explicacion) return null;
  return {
    estado: "lista",
    progreso: null,
    delante: null,
    error: null,
    resultado: ic.explicacion,
  };
}

interface ExplicacionPrediccionProps {
  interconsulta: Interconsulta;
}

export default function ExplicacionPrediccion({
  interconsulta: ic,
}: ExplicacionPrediccionProps) {
  const [estado, setEstado] = useState<EstadoExplicacion | null>(() =>
    estadoInicial(ic),
  );
  const [error, setError] = useState<string | null>(null);
  const [errorRed, setErrorRed] = useState(false);
  const [reintentos, setReintentos] = useState(0);
  const [inicio, setInicio] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  // La página carga la interconsulta en el navegador, así que este componente
  // nunca se renderiza en el servidor y puede leer la vista guardada al tiro.
  const [vista, setVista] = useState<Vista>(vistaGuardada);

  const sugerida =
    ic.esValidaParaPriorizacion !== false && ic.priorizacionIA.priorizada
      ? ic.priorizacionIA.nivelSugerido
      : null;
  const activo = enCurso(estado);
  const guardadaVigente = Boolean(
    ic.explicacion && ic.explicacion.clase === sugerida,
  );

  // Al abrir la página puede haber un cálculo andando (se pidió y se salió):
  // se retoma el seguimiento en vez de ofrecer calcularlo de nuevo.
  useEffect(() => {
    if (!sugerida || guardadaVigente) return;
    const control = new AbortController();
    consultarExplicacion(ic.id, control.signal)
      .then((actual) => {
        setEstado(actual);
        if (enCurso(actual)) setInicio(Date.now());
      })
      .catch(() => undefined);
    return () => control.abort();
  }, [ic.id, guardadaVigente, sugerida]);

  // Mientras se calcula, se pregunta por el avance. Cada respuesta nueva
  // reprograma la siguiente; un error de red se reintenta igual.
  useEffect(() => {
    if (!activo) return;
    const control = new AbortController();
    const espera = window.setTimeout(async () => {
      try {
        setEstado(await consultarExplicacion(ic.id, control.signal));
        setErrorRed(false);
      } catch {
        if (control.signal.aborted) return;
        setErrorRed(true);
        setReintentos((n) => n + 1);
      }
    }, INTERVALO_CONSULTA_MS);
    return () => {
      window.clearTimeout(espera);
      control.abort();
    };
  }, [activo, estado, reintentos, ic.id]);

  useEffect(() => {
    if (!activo) return;
    const intervalo = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(intervalo);
  }, [activo]);

  if (ic.esValidaParaPriorizacion === false) {
    return null;
  }

  const pedir = async (forzar: boolean) => {
    const momento = Date.now();
    setError(null);
    setInicio(momento);
    setAhora(momento);
    try {
      setEstado(await pedirExplicacion(ic.id, forzar));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo pedir la explicación",
      );
    }
  };

  const cambiarVista = (nueva: Vista) => {
    setVista(nueva);
    try {
      window.localStorage.setItem(CLAVE_VISTA, nueva);
    } catch {
      // Sin almacenamiento (ventana privada): la vista vale solo esta vez.
    }
  };

  const transcurrido =
    inicio !== null ? Math.max(0, Math.floor((ahora - inicio) / 1000)) : null;
  // Una explicación de otra clase explica una sugerencia que ya no existe
  // (la interconsulta se volvió a priorizar después).
  const vigente =
    estado?.resultado && estado.resultado.clase === sugerida
      ? estado.resultado
      : null;

  return (
    <section
      id="explicacion"
      className="pz-panel @container"
      aria-labelledby="explicacion-titulo"
    >
      <div className="pz-panel__head">
        <span className="pz-eyebrow pz-eyebrow--purple">Explicabilidad</span>
        <h2 id="explicacion-titulo" className="pz-panel__title">
          {sugerida ? (
            <>
              ¿Por qué el modelo sugiere prioridad{" "}
              <span className={`pz-chip pz-chip--${sugerida} align-middle`}>
                {sugerida}
              </span>
              ?
            </>
          ) : (
            "¿Por qué el modelo sugiere esta prioridad?"
          )}
        </h2>
        <p className="pz-panel__sub">
          Qué campos de la interconsulta empujaron la sugerencia del modelo, y
          cuánto. Explica al modelo; no valida la decisión clínica.
        </p>
      </div>

      {sugerida && <AvisoProcedencia interconsulta={ic} sugerida={sugerida} />}

      {!sugerida ? (
        <div className="pz-panel__body">
          <p className="text-[.88rem] text-[var(--pz-ink-2)]">
            El modelo todavía no prioriza esta interconsulta. Priorízala con IA
            y después podrás ver por qué sugirió lo que sugirió.
          </p>
        </div>
      ) : (
        <>
          {activo && estado ? (
            <Progreso
              estado={estado}
              transcurrido={transcurrido}
              errorRed={errorRed}
            />
          ) : vigente ? (
            <>
              <SelectorVista vista={vista} onCambiar={cambiarVista} />
              <div
                id="explicacion-vista"
                role="tabpanel"
                aria-labelledby={`explicacion-tab-${vista}`}
              >
                {vista === "resumen" && (
                  <Resumen shap={vigente} clase={vigente.clase} />
                )}
                {vista === "palabras" && (
                  <Palabras
                    shap={vigente}
                    clase={vigente.clase}
                    interconsulta={ic}
                  />
                )}
                {vista === "campos" && (
                  <AportesPorCampo shap={vigente} clase={vigente.clase} />
                )}
              </div>
              <PieCalculo resultado={vigente} onRecalcular={() => pedir(true)} />
            </>
          ) : (
            <Invitacion
              error={estado?.estado === "error" ? estado.error : error}
              desactualizada={Boolean(estado?.resultado) && !vigente}
              onPedir={() => pedir(false)}
            />
          )}

          <ComoLeerlo shap={vigente} />
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function AvisoProcedencia({
  interconsulta: ic,
  sugerida,
}: {
  interconsulta: Interconsulta;
  sugerida: NivelPrioridad;
}) {
  let texto: string | null = null;
  if (ic.prioridadForzadaPorRegla) {
    texto = `La prioridad vigente la fijó una bandera roja, no el modelo. Lo que sigue explica la sugerencia del modelo (${sugerida}), que quedó como referencia.`;
  } else if (!ic.sinPrioridad && ic.prioridadActual !== sugerida) {
    texto = `La prioridad vigente la cambió un médico. Lo que sigue explica la sugerencia original del modelo (${sugerida}).`;
  }
  if (!texto) return null;

  return (
    <p
      className="px-[1.15rem] py-3 text-[.84rem] leading-relaxed text-[var(--pz-ink-2)]"
      style={{
        background: "var(--pz-paper-2)",
        borderBottom: "1px solid var(--pz-line)",
        borderLeft: "2px solid var(--pz-line-2)",
      }}
    >
      {texto}
    </p>
  );
}

/** Pestañas para elegir la vista. Con las flechas se pasa de una a otra, como
 *  en cualquier grupo de pestañas. */
function SelectorVista({
  vista,
  onCambiar,
}: {
  vista: Vista;
  onCambiar: (vista: Vista) => void;
}) {
  const mover = (evento: KeyboardEvent<HTMLDivElement>) => {
    const actual = VISTAS.findIndex((v) => v.id === vista);
    const destinos: Record<string, number> = {
      ArrowRight: (actual + 1) % VISTAS.length,
      ArrowLeft: (actual - 1 + VISTAS.length) % VISTAS.length,
      Home: 0,
      End: VISTAS.length - 1,
    };
    const destino = destinos[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    onCambiar(VISTAS[destino].id);
    document.getElementById(`explicacion-tab-${VISTAS[destino].id}`)?.focus();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-[1.4rem] pt-4">
      <div
        className="pz-seg pz-seg--vistas"
        role="tablist"
        aria-label="Cómo ver la explicación"
        onKeyDown={mover}
      >
        {VISTAS.map((v) => {
          const elegida = v.id === vista;
          return (
            <button
              key={v.id}
              id={`explicacion-tab-${v.id}`}
              type="button"
              role="tab"
              aria-selected={elegida}
              aria-controls="explicacion-vista"
              tabIndex={elegida ? 0 : -1}
              className={`pz-seg__op${elegida ? " is-on" : ""}`}
              onClick={() => onCambiar(v.id)}
            >
              {v.etiqueta}
            </button>
          );
        })}
      </div>
      <span className="text-[.76rem] text-[var(--pz-ink-3)]">
        Resumen y Por campo muestran el mismo cálculo; Palabras mira dentro
        de cada campo.
      </span>
    </div>
  );
}

/** Cuándo se calculó y cómo recalcularlo. */
function PieCalculo({
  resultado,
  onRecalcular,
}: {
  resultado: ExplicacionShap;
  onRecalcular: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-[1.4rem] pb-4">
      <span className="text-[.76rem] text-[var(--pz-ink-3)]">
        Calculado con SHAP el{" "}
        {formatearFechaHoraChileLarga(resultado.generada_en)} en{" "}
        {duracion(resultado.segundos)}
      </span>
      <button
        type="button"
        onClick={onRecalcular}
        className="pz-btn pz-btn--claro pz-btn--mini"
      >
        Recalcular
      </button>
    </div>
  );
}

function Invitacion({
  error,
  desactualizada,
  onPedir,
}: {
  error: string | null | undefined;
  desactualizada: boolean;
  onPedir: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-[1.4rem] pt-4 pb-5">
      <p className="text-[.86rem] leading-relaxed text-[var(--pz-ink-2)]">
        {desactualizada &&
          "La sugerencia del modelo cambió desde el último cálculo. "}
        Esta interconsulta todavía no tiene explicación: se cargó antes de que
        se calcularan solas, o el cálculo no terminó. La explicación muestra
        cuánto empujó cada campo y cada palabra hacia la prioridad sugerida o
        en contra. Tarda unos minutos y corre en segundo plano; después queda
        guardada.
      </p>
      <div>
        <button type="button" onClick={onPedir} className="pz-btn pz-btn--morado">
          Calcular explicación
        </button>
      </div>
      {error && <EstadoVista tipo="error" texto={error} />}
    </div>
  );
}

function Progreso({
  estado,
  transcurrido,
  errorRed,
}: {
  estado: EstadoExplicacion;
  transcurrido: number | null;
  errorRed: boolean;
}) {
  const progreso = estado.progreso;
  const enCola = estado.estado === "en_cola";
  const preparando = progreso?.fase === "preparando";
  const determinado =
    !enCola && !preparando && progreso !== null && progreso.total > 0;
  const fraccion = determinado && progreso ? progreso.hechos / progreso.total : 0;

  let titulo: string;
  if (enCola) {
    const delante = estado.delante ?? 0;
    titulo =
      delante > 0
        ? `En cola · ${delante} ${delante === 1 ? "explicación" : "explicaciones"} antes que esta (unos ${Math.max(1, Math.round(delante * MINUTOS_POR_EXPLICACION))} min)`
        : "En cola · empieza en un momento";
  } else if (preparando) {
    titulo = "Preparando el modelo";
  } else if (progreso?.fase === "palabras") {
    titulo = "Paso 2 de 2 · Midiendo el peso de cada palabra";
  } else {
    titulo = "Paso 1 de 2 · Calculando el aporte de cada campo";
  }

  return (
    <div className="flex flex-col gap-2 px-[1.4rem] pt-4 pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span
          className="text-[.86rem] font-semibold text-[var(--pz-ink)]"
          role="status"
          aria-live="polite"
        >
          {titulo}
        </span>
        {transcurrido !== null && (
          <span className="pz-label">
            {Math.floor(transcurrido / 60)}:
            {String(transcurrido % 60).padStart(2, "0")}
          </span>
        )}
      </div>
      <div className="pz-meter" style={{ height: 6 }} aria-hidden="true">
        {determinado ? (
          <div
            className="pz-meter__fill"
            style={{
              width: `${Math.max(2, Math.round(fraccion * 100))}%`,
              background: "var(--pz-favor)",
            }}
          />
        ) : (
          <div className="pz-meter__fill pz-meter__fill--indeterminado" />
        )}
      </div>
      {determinado && progreso && (
        <span className="pz-label">
          {progreso.hechos} de {progreso.total}{" "}
          {progreso.fase === "palabras" ? "palabras" : "combinaciones"}
        </span>
      )}
      <p className="text-[.8rem] text-[var(--pz-ink-3)]">
        La explicación se empezó a calcular sola al priorizar la
        interconsulta. Puedes seguir revisándola o salir de la página: el
        cálculo sigue en el servidor y queda guardado.
      </p>
      {errorRed && (
        <p className="text-[.8rem] text-[var(--pz-ink-2)]">
          Se perdió la conexión con el servidor; reintentando…
        </p>
      )}
    </div>
  );
}

/** Los campos que no aportaron y por qué. Las barras ya lo muestran en su
 *  fila; el resumen lo dice al pie. */
function SinEfecto({ campos }: { campos: AporteCampo[] }) {
  const sinEfecto = campos.filter(sinAporte);
  if (sinEfecto.length === 0) return null;
  return (
    <p className="text-[.8rem] leading-relaxed text-[var(--pz-ink-3)]">
      Sin efecto:{" "}
      {sinEfecto
        .map((c) => `${ETIQUETAS[c.campo]} (${motivoSinAporte(c)})`)
        .join(" · ")}
      .
      {sinEfecto.some((c) => c.no_leido) &&
        " «No leído»: quedó después del límite de texto que acepta el modelo, así que no influyó."}
    </p>
  );
}

/* --------------------------------------------------------------- resumen -- */

function Resumen({
  shap,
  clase,
}: {
  shap: ExplicacionShap;
  clase: NivelPrioridad;
}) {
  const campos = porMagnitud(shap.campos);
  const aFavor = campos.filter((c) => c.aporte > 0);
  const enContra = campos.filter((c) => c.aporte < 0);
  const cambio = shap.final - shap.base;
  const puntos = formatoDecimal.format(Math.abs(cambio));

  return (
    <div className="flex flex-col gap-4 px-[1.4rem] pt-4 pb-4">
      <p className="text-[.95rem] leading-relaxed text-[var(--pz-ink)]">
        El modelo le da <strong>{porcentaje(shap.final)}</strong> de
        probabilidad a {mayuscula(clase)}. Es la confianza que aparece en el
        panel de decisión.
      </p>

      <div className="grid gap-x-6 gap-y-4 @xl:grid-cols-2">
        <ListaResumen
          titulo={`Empujaron hacia ${mayuscula(clase)}`}
          campos={aFavor}
          color="var(--pz-favor)"
          vacia="Ningún campo empujó hacia esta prioridad."
        />
        <ListaResumen
          titulo={`Empujaron en contra de ${mayuscula(clase)}`}
          campos={enContra}
          color="var(--pz-contra)"
          vacia="Ningún campo empujó en contra."
        />
      </div>

      <p
        className="p-3 text-[.84rem] leading-relaxed text-[var(--pz-ink-2)]"
        style={{
          background: "var(--pz-paper-2)",
          borderLeft: "2px solid var(--pz-line-2)",
        }}
      >
        Con todos los campos vacíos, el modelo ya le daría{" "}
        {porcentaje(shap.base)} a {mayuscula(clase)}.{" "}
        {Math.abs(cambio) < 0.05
          ? "Lo que dice esta interconsulta prácticamente no cambia esa probabilidad."
          : `Lo que dice esta interconsulta, sumando todos los campos, ${cambio > 0 ? "la sube" : "la baja"} ${puntos} puntos, hasta ${porcentaje(shap.final)}.`}
        {Math.abs(cambio) < CAMBIO_PEQUENO && (
          <>
            {" "}
            <strong className="text-[var(--pz-ink)]">
              Es un cambio pequeño:
            </strong>{" "}
            la sugerencia se explica más por la tendencia general del modelo que
            por el contenido de esta interconsulta.
          </>
        )}
      </p>

      <SinEfecto campos={shap.campos} />
    </div>
  );
}

function ListaResumen({
  titulo,
  campos,
  color,
  vacia,
}: {
  titulo: string;
  campos: AporteCampo[];
  color: string;
  vacia: string;
}) {
  return (
    <div>
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 flex-none rounded-[2px]"
          style={{ background: color }}
          aria-hidden="true"
        />
        <span className="text-[.84rem] font-semibold text-[var(--pz-ink-2)]">
          {titulo}
        </span>
      </span>
      {campos.length === 0 ? (
        <p className="mt-2 text-[.84rem] text-[var(--pz-ink-3)]">{vacia}</p>
      ) : (
        <ul className="mt-1.5">
          {campos.map((c) => {
            const { texto, nivel } = fuerza(c.aporte);
            return (
              <li
                key={c.campo}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5"
                style={{ borderTop: "1px solid var(--pz-line)" }}
                title={`${ETIQUETAS[c.campo]}: ${c.aporte > 0 ? "suma" : "resta"} ${formatoDecimal.format(Math.abs(c.aporte))} puntos`}
              >
                <span className="min-w-0 text-[.9rem] text-[var(--pz-ink)]">
                  {ETIQUETAS[c.campo]}
                </span>
                <span className="ml-auto flex flex-none items-center gap-2">
                  <Fuerza nivel={nivel} color={color} />
                  <span className="w-[3.2rem] text-[.8rem] text-[var(--pz-ink-2)]">
                    {texto}
                  </span>
                  <span className="pz-mono w-[2.8rem] text-right text-[.78rem] text-[var(--pz-ink-3)]">
                    {conSigno(c.aporte)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Tres marcas, como las barras de señal: cuántas se llenan dice cuánto
 *  empujó. La palabra al lado dice lo mismo para quien no distinga el color. */
function Fuerza({ nivel, color }: { nivel: number; color: string }) {
  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true">
      {[1, 2, 3].map((marca) => (
        <span
          key={marca}
          className="w-[5px] rounded-[1px]"
          style={{
            height: `${4 + marca * 3}px`,
            background: marca <= nivel ? color : "var(--pz-paper-3)",
          }}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------- por campo -- */

/** Columnas de las barras: en angosto una sola (la etiqueta arriba), y desde
 *  @md la etiqueta a la izquierda. */
const COLUMNAS_BARRAS = "grid-cols-1 @md:grid-cols-[minmax(8.5rem,12rem)_1fr]";

function AportesPorCampo({
  shap,
  clase,
}: {
  shap: ExplicacionShap;
  clase: NivelPrioridad;
}) {
  const filas = [...shap.campos].sort(
    (a, b) =>
      Number(sinAporte(a)) - Number(sinAporte(b)) ||
      Math.abs(b.aporte) - Math.abs(a.aporte),
  );
  const hayNoLeidos = shap.campos.some((c) => c.no_leido);
  const maximo = Math.max(0.1, ...shap.campos.map((c) => Math.abs(c.aporte)));

  return (
    <div className="px-[1.4rem] pt-4 pb-4">
      <p className="text-[.9rem] leading-relaxed text-[var(--pz-ink)]">
        Cuántos puntos de probabilidad sumó cada campo a {mayuscula(clase)}{" "}
        (barra a la derecha) o le restó (a la izquierda). Entre todos llevan la
        probabilidad de {porcentaje(shap.base)} (interconsulta vacía) a{" "}
        <strong>{porcentaje(shap.final)}</strong>, la confianza del modelo.
        {hayNoLeidos &&
          " Los campos «no leídos» quedaron después del límite de texto que acepta el modelo: no influyeron en la sugerencia."}
      </p>

      <div className="mt-4 flex flex-col gap-[2px]" aria-hidden="true">
        {filas.map((fila) => (
          <FilaAporte
            key={fila.campo}
            fila={fila}
            maximo={maximo}
            clase={clase}
          />
        ))}
        <div className={`grid ${COLUMNAS_BARRAS} gap-3 pt-1.5`}>
          <span className="hidden @md:block" />
          <div className="flex justify-between">
            <Leyenda color="var(--pz-contra)" texto={`Resta a ${mayuscula(clase)}`} />
            <Leyenda color="var(--pz-favor)" texto={`Suma a ${mayuscula(clase)}`} />
          </div>
        </div>
      </div>

      <TablaAportes shap={shap} clase={clase} filas={filas} />
    </div>
  );
}

/** Lo mismo que el gráfico, para lectores de pantalla. */
function TablaAportes({
  shap,
  clase,
  filas,
}: {
  shap: ExplicacionShap;
  clase: NivelPrioridad;
  filas: AporteCampo[];
}) {
  return (
    <table className="sr-only">
      <caption>
        Aporte de cada campo a la probabilidad de {clase}, en puntos.
        Probabilidad con la interconsulta vacía {porcentaje(shap.base)}, final{" "}
        {porcentaje(shap.final)}.
      </caption>
      <thead>
        <tr>
          <th scope="col">Campo</th>
          <th scope="col">Aporte</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => (
          <tr key={fila.campo}>
            <th scope="row">{ETIQUETAS[fila.campo]}</th>
            <td>{motivoSinAporte(fila) ?? `${conSigno(fila.aporte)} puntos`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FilaAporte({
  fila,
  maximo,
  clase,
}: {
  fila: AporteCampo;
  maximo: number;
  clase: NivelPrioridad;
}) {
  const etiqueta = ETIQUETAS[fila.campo];
  const aFavor = fila.aporte >= 0;
  const largo = (Math.abs(fila.aporte) / maximo) * 50 * LARGO_MAXIMO_BARRA;
  const color = aFavor ? "var(--pz-favor)" : "var(--pz-contra)";
  const sinBarra = motivoSinAporte(fila);
  const descripcion = sinBarra
    ? `${etiqueta}: ${sinBarra}, no aporta`
    : `${etiqueta}: ${aFavor ? "suma" : "resta"} ${formatoDecimal.format(Math.abs(fila.aporte))} puntos a la probabilidad de ${mayuscula(clase)}`;

  return (
    <div
      className={`grid ${COLUMNAS_BARRAS} items-center gap-x-3 gap-y-0.5 py-1`}
      title={descripcion}
    >
      <span
        className={`flex min-w-0 justify-between gap-2 text-[.84rem] ${sinBarra ? "text-[var(--pz-ink-3)]" : "text-[var(--pz-ink-2)]"}`}
      >
        <span className="truncate">{etiqueta}</span>
        {/* En angosto el valor va junto a la etiqueta: al lado de la barra
            no cabe. */}
        <span className="pz-mono flex-none text-[.78rem] @md:hidden">
          {sinBarra ?? conSigno(fila.aporte)}
        </span>
      </span>
      <div className="relative h-[22px]">
        <span
          className="absolute top-0 bottom-0 w-px"
          style={{ left: "50%", background: "var(--pz-line-2)" }}
        />
        {sinBarra ? (
          <span
            className="pz-label absolute top-1/2 hidden -translate-y-1/2 @md:block"
            style={{ left: "calc(50% + 8px)" }}
          >
            {sinBarra}
          </span>
        ) : (
          <>
            <span
              className="absolute top-1/2 h-[14px] -translate-y-1/2"
              style={{
                width: `${largo}%`,
                background: color,
                ...(aFavor
                  ? { left: "50%", borderRadius: "0 4px 4px 0" }
                  : { right: "50%", borderRadius: "4px 0 0 4px" }),
              }}
            />
            <span
              className="pz-mono absolute top-1/2 hidden -translate-y-1/2 text-[.78rem] whitespace-nowrap text-[var(--pz-ink-2)] @md:block"
              style={
                aFavor
                  ? { left: `calc(50% + ${largo}% + 6px)` }
                  : { right: `calc(50% + ${largo}% + 6px)` }
              }
            >
              {conSigno(fila.aporte)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 flex-none rounded-[2px]"
        style={{ background: color }}
      />
      <span className="pz-label">{texto}</span>
    </span>
  );
}

/* -------------------------------------------------------------- palabras -- */

/** Campos cortos, en grilla, y campos de texto libre, en bloque. */
const CAMPOS_DERIVACION: CampoModelo[] = [
  "espec_origen",
  "espec_destino",
  "edad",
  "sexo",
];

const CAMPOS_CLINICOS: CampoModelo[] = [
  "historia_clinica",
  "fundamentos_diagnostico",
  "examenes_complementarios",
  "motivo_interconsulta",
];

/** Bajo este aporte, en puntos, la palabra no se resalta: resaltar todo es no
 *  resaltar nada. Fijo y no relativo a la que más pesó: con un umbral
 *  relativo, una sola palabra extrema dejaba al resto sin resaltar. */
const UMBRAL_PUNTOS = 1;

/** Cuántas palabras de texto libre se resaltan, de la que más pesó hacia
 *  abajo. Con todas las que pasan el umbral, en un texto largo quedaba casi
 *  todo resaltado. */
const PALABRAS_RESALTADAS = 12;

/** Cuántas palabras van en cada lista de "lo que más pesó". */
const DESTACADAS_POR_LISTA = 5;

/** Palabras que no se resaltan aunque pesen: cuando pesan es porque borrarlas
 *  rompe una expresión ("fracción de eyección"), no por ellas mismas. */
const PALABRAS_FUNCIONALES = new Set([
  "a", "al", "con", "de", "del", "e", "el", "en", "la", "las", "lo", "los",
  "o", "para", "por", "que", "se", "sin", "su", "sus", "u", "un", "una", "y",
]);

interface PalabraDeCampo extends PalabraAtribuida {
  campo: CampoModelo;
}

function textoDelCampo(ic: Interconsulta, campo: CampoModelo): string {
  switch (campo) {
    case "espec_origen":
      return ic.especOrigen ?? "";
    case "edad":
      return ic.edad !== undefined ? String(ic.edad) : "";
    case "sexo":
      return ic.sexo ?? "";
    case "espec_destino":
      return ic.especDestino ?? "";
    case "historia_clinica":
      return ic.historiaClinica ?? "";
    case "fundamentos_diagnostico":
      return ic.fundamentosDiagnostico ?? "";
    case "examenes_complementarios":
      return ic.examenesComplementarios ?? "";
    case "motivo_interconsulta":
      return ic.motivoOriginal ?? "";
  }
}

/** "evolucion," → "evolucion": en el texto la puntuación va, en una lista
 *  de palabras sobra. */
function sinPuntuacion(texto: string): string {
  return texto.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") || texto;
}

function todasLasPalabras(shap: ExplicacionShap): PalabraDeCampo[] {
  return (
    Object.entries(shap.palabras) as [CampoModelo, PalabraAtribuida[]][]
  ).flatMap(([campo, palabras]) => palabras.map((p) => ({ ...p, campo })));
}

function clavePalabra(campo: CampoModelo, inicio: number): string {
  return `${campo}:${inicio}`;
}

/** Las palabras que se resaltan: los campos que van enteros (especialidades,
 *  edad, sexo, campos de una palabra) si pasan el umbral, y de texto libre las
 *  que más pesaron, sin las funcionales. */
function palabrasResaltadas(shap: ExplicacionShap): PalabraDeCampo[] {
  const entero = (campo: CampoModelo) =>
    CAMPOS_DERIVACION.includes(campo) || shap.palabras[campo]?.length === 1;
  const relevantes = todasLasPalabras(shap).filter(
    (p) => Math.abs(p.aporte) >= UMBRAL_PUNTOS,
  );
  const libres = relevantes
    .filter(
      (p) =>
        !entero(p.campo) &&
        !PALABRAS_FUNCIONALES.has(sinPuntuacion(p.texto).toLowerCase()),
    )
    .sort((a, b) => Math.abs(b.aporte) - Math.abs(a.aporte))
    .slice(0, PALABRAS_RESALTADAS);
  return [...relevantes.filter((p) => entero(p.campo)), ...libres];
}

function Palabras({
  shap,
  clase,
  interconsulta: ic,
}: {
  shap: ExplicacionShap;
  clase: NivelPrioridad;
  interconsulta: Interconsulta;
}) {
  const resaltadas = palabrasResaltadas(shap);
  const claves = new Set(resaltadas.map((p) => clavePalabra(p.campo, p.inicio)));
  const maximo = Math.max(0.01, ...resaltadas.map((p) => Math.abs(p.aporte)));
  const aportes = new Map(shap.campos.map((c) => [c.campo, c]));
  const truncado = Object.keys(shap.no_leido).length > 0;

  return (
    <div className="flex flex-col gap-4 px-[1.4rem] pt-4 pb-4">
      <p className="text-[.9rem] leading-relaxed text-[var(--pz-ink)]">
        Las palabras que más empujaron hacia {mayuscula(clase)} o en contra,
        sobre el texto de la interconsulta. El peso de cada palabra es cuánto
        cambia la probabilidad si se borra solo esa palabra. Pasa el cursor
        sobre una palabra para ver la cifra.
      </p>

      <Destacadas palabras={resaltadas} maximo={maximo} clase={clase} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <LeyendaPalabra
          color="var(--pz-favor)"
          estilo="solid"
          texto={`A favor de ${mayuscula(clase)}`}
        />
        <LeyendaPalabra
          color="var(--pz-contra)"
          estilo="dashed"
          texto={`En contra de ${mayuscula(clase)}`}
        />
        <span className="pz-label">Más intenso = más peso</span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 @md:grid-cols-2">
        {CAMPOS_DERIVACION.map((campo) => (
          <div key={campo}>
            <dt>
              <EncabezadoCampo campo={campo} aporte={aportes.get(campo)} />
            </dt>
            <dd className="mt-1 text-[.86rem] text-[var(--pz-ink)]">
              <TextoResaltado
                texto={textoDelCampo(ic, campo)}
                campo={campo}
                resaltadas={claves}
                palabras={shap.palabras[campo]}
                noLeidoDesde={shap.no_leido[campo]}
                maximo={maximo}
                clase={clase}
              />
            </dd>
          </div>
        ))}
      </dl>

      {CAMPOS_CLINICOS.map((campo) => {
        const texto = textoDelCampo(ic, campo);
        return (
          <div key={campo}>
            <EncabezadoCampo campo={campo} aporte={aportes.get(campo)} />
            {texto.trim() ? (
              <p
                className="mt-1.5 p-3 text-[.9rem] leading-[1.9] whitespace-pre-wrap text-[var(--pz-ink)]"
                style={{
                  background: "var(--pz-paper-2)",
                  borderLeft: "2px solid var(--pz-line-2)",
                }}
              >
                <TextoResaltado
                  texto={texto}
                  campo={campo}
                  resaltadas={claves}
                  palabras={shap.palabras[campo]}
                  noLeidoDesde={shap.no_leido[campo]}
                  maximo={maximo}
                  clase={clase}
                />
              </p>
            ) : (
              <p className="mt-1 text-[.84rem] text-[var(--pz-ink-3)]">Vacío.</p>
            )}
          </div>
        );
      })}

      <p className="text-[.8rem] leading-relaxed text-[var(--pz-ink-3)]">
        Las palabras de un campo no suman su total: dos palabras que dicen lo
        mismo se cubren entre sí, y borrar solo una cambia poco. El total de
        cada campo, al lado de su nombre, es el de las otras vistas. Se
        resaltan las {PALABRAS_RESALTADAS} palabras que más pesaron (desde{" "}
        {UMBRAL_PUNTOS} punto); las especialidades, la edad, el sexo y los
        campos de una sola palabra van enteros, con su total. Palabras como
        «de» o «con» no se resaltan: cuando pesan es porque borrarlas rompe una
        expresión, como «fracción de eyección».
        {truncado && (
          <>
            {" "}
            <span className="italic">El texto en cursiva</span> no lo alcanzó a
            leer el modelo: su entrada tiene un límite de largo y la
            interconsulta lo supera. Ese tramo no influyó en la sugerencia.
          </>
        )}
      </p>
    </div>
  );
}

/** El nombre del campo con su aporte total, el mismo de las otras vistas. */
function EncabezadoCampo({
  campo,
  aporte,
}: {
  campo: CampoModelo;
  aporte: AporteCampo | undefined;
}) {
  const motivo = aporte ? motivoSinAporte(aporte) : null;
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="pz-label">{ETIQUETAS[campo]}</span>
      {aporte && (
        <span className="pz-mono text-[.74rem] text-[var(--pz-ink-3)]">
          {motivo ?? `campo: ${conSigno(aporte.aporte)}`}
        </span>
      )}
    </span>
  );
}

function Destacadas({
  palabras,
  maximo,
  clase,
}: {
  palabras: PalabraDeCampo[];
  maximo: number;
  clase: NivelPrioridad;
}) {
  // Una palabra repetida se muestra una vez, con su mayor aporte.
  const porTexto = new Map<string, PalabraDeCampo>();
  for (const palabra of palabras) {
    const clave = sinPuntuacion(palabra.texto).toLowerCase();
    const previa = porTexto.get(clave);
    if (!previa || Math.abs(palabra.aporte) > Math.abs(previa.aporte)) {
      porTexto.set(clave, palabra);
    }
  }
  const relevantes = [...porTexto.values()];
  const aFavor = relevantes
    .filter((p) => p.aporte > 0)
    .sort((a, b) => b.aporte - a.aporte)
    .slice(0, DESTACADAS_POR_LISTA);
  const enContra = relevantes
    .filter((p) => p.aporte < 0)
    .sort((a, b) => a.aporte - b.aporte)
    .slice(0, DESTACADAS_POR_LISTA);

  return (
    <div className="grid gap-x-6 gap-y-4 @xl:grid-cols-2">
      <ListaDestacadas
        titulo={`Más a favor de ${mayuscula(clase)}`}
        palabras={aFavor}
        maximo={maximo}
        color="var(--pz-favor)"
      />
      <ListaDestacadas
        titulo={`Más en contra de ${mayuscula(clase)}`}
        palabras={enContra}
        maximo={maximo}
        color="var(--pz-contra)"
      />
    </div>
  );
}

function ListaDestacadas({
  titulo,
  palabras,
  maximo,
  color,
}: {
  titulo: string;
  palabras: PalabraDeCampo[];
  maximo: number;
  color: string;
}) {
  return (
    <div>
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 flex-none rounded-[2px]"
          style={{ background: color }}
          aria-hidden="true"
        />
        <span className="text-[.84rem] font-semibold text-[var(--pz-ink-2)]">
          {titulo}
        </span>
      </span>
      {palabras.length === 0 ? (
        <p className="mt-2 text-[.84rem] text-[var(--pz-ink-3)]">
          Ninguna palabra con peso relevante.
        </p>
      ) : (
        <ol className="mt-1.5">
          {palabras.map((palabra) => (
            <li
              key={`${palabra.campo}-${palabra.inicio}`}
              className="grid grid-cols-[minmax(0,1fr)_3rem_2.8rem] items-center gap-2 py-1"
              style={{ borderTop: "1px solid var(--pz-line)" }}
            >
              <span className="min-w-0 truncate text-[.9rem] text-[var(--pz-ink)]">
                {sinPuntuacion(palabra.texto)}
                <span className="ml-1.5 text-[.74rem] text-[var(--pz-ink-3)]">
                  {ETIQUETAS[palabra.campo]}
                </span>
              </span>
              <span
                className="h-[6px] rounded-full"
                style={{ background: "var(--pz-paper-3)" }}
                aria-hidden="true"
              >
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.round((Math.abs(palabra.aporte) / maximo) * 100)}%`,
                    background: color,
                  }}
                />
              </span>
              <span className="pz-mono text-right text-[.78rem] text-[var(--pz-ink-3)]">
                {conSigno(palabra.aporte)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LeyendaPalabra({
  color,
  estilo,
  texto,
}: {
  color: string;
  estilo: "solid" | "dashed";
  texto: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-[12px] w-[18px] rounded-[2px]"
        style={{
          background: `color-mix(in srgb, ${color} 35%, transparent)`,
          borderBottom: `2px ${estilo} ${color}`,
        }}
        aria-hidden="true"
      />
      <span className="pz-label">{texto}</span>
    </span>
  );
}

/**
 * El texto original con cada palabra resaltada según su aporte. Los offsets
 * vienen del backend sobre este mismo texto; si alguno no calza (texto editado
 * después de explicar), esa palabra se deja sin resaltar en vez de desfasar el
 * resto.
 */
function TextoResaltado({
  texto,
  campo,
  resaltadas,
  palabras,
  noLeidoDesde,
  maximo,
  clase,
}: {
  texto: string;
  campo: CampoModelo;
  resaltadas: Set<string>;
  palabras?: PalabraAtribuida[];
  noLeidoDesde?: number;
  maximo: number;
  clase: NivelPrioridad;
}) {
  if (!texto) {
    return <span className="text-[var(--pz-ink-3)]">—</span>;
  }

  const limite = Math.min(noLeidoDesde ?? texto.length, texto.length);
  const partes: ReactNode[] = [];
  let posicion = 0;

  for (const palabra of [...(palabras ?? [])].sort((a, b) => a.inicio - b.inicio)) {
    const { inicio, fin } = palabra;
    if (
      inicio < posicion ||
      fin > limite ||
      inicio >= fin ||
      texto.slice(inicio, fin) !== palabra.texto
    ) {
      continue;
    }
    if (inicio > posicion) {
      partes.push(texto.slice(posicion, inicio));
    }
    partes.push(
      resaltadas.has(clavePalabra(campo, inicio)) ? (
        <Marca key={inicio} palabra={palabra} maximo={maximo} clase={clase} />
      ) : (
        palabra.texto
      ),
    );
    posicion = fin;
  }

  if (limite > posicion) {
    partes.push(texto.slice(posicion, limite));
  }
  if (limite < texto.length) {
    partes.push(
      <span
        key="no-leido"
        className="text-[var(--pz-ink-3)] italic"
        title="El modelo no alcanzó a leer este tramo (límite de largo)"
      >
        {texto.slice(limite)}
      </span>,
    );
  }

  return <>{partes}</>;
}

function Marca({
  palabra,
  maximo,
  clase,
}: {
  palabra: PalabraAtribuida;
  maximo: number;
  clase: NivelPrioridad;
}) {
  // Raíz cuadrada: una palabra extrema no deja a las demás casi invisibles.
  const intensidad = Math.min(1, Math.sqrt(Math.abs(palabra.aporte) / maximo));

  const aFavor = palabra.aporte > 0;
  const color = aFavor ? "var(--pz-favor)" : "var(--pz-contra)";
  // De 12% a 55% de opacidad: el texto en tinta conserva contraste en todo el
  // rango, y la diferencia entre una palabra suave y una fuerte se lee.
  const opacidad = Math.round(12 + intensidad * 43);

  return (
    <mark
      className="px-[2px] text-[var(--pz-ink)]"
      style={{
        background: `color-mix(in srgb, ${color} ${opacidad}%, transparent)`,
        // El subrayado tambien escala: con el color pleno, una palabra que
        // apenas pesa se veia tan marcada como la que mas pesa.
        borderBottom: `2px ${aFavor ? "solid" : "dashed"} color-mix(in srgb, ${color} ${Math.round(30 + intensidad * 70)}%, transparent)`,
        borderRadius: "2px",
      }}
      title={`Sin esta palabra, la probabilidad de ${mayuscula(clase)} ${aFavor ? "baja" : "sube"} ${formatoDecimal.format(Math.abs(palabra.aporte))} puntos`}
    >
      {palabra.texto}
    </mark>
  );
}

/* --------------------------------------------------------- cómo leerlo -- */

function ComoLeerlo({ shap }: { shap: ExplicacionShap | null }) {
  return (
    <div style={{ borderTop: "2px solid var(--pz-line)" }}>
      <details className="group px-[1.4rem] py-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[var(--pz-ink-3)] select-none [&::-webkit-details-marker]:hidden">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-3 w-3 transition-transform group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
          {/* La etiqueta va en su propio span: .pz-label fija un display que
              le ganaba al flex del summary y dejaba la flecha encima. */}
          <span className="pz-label">Cómo se calcula y cómo leerlo</span>
        </summary>
        <div className="mt-3 flex flex-col gap-2.5 text-[.85rem] leading-relaxed text-[var(--pz-ink-2)]">
          <p>
            <strong className="text-[var(--pz-ink)]">
              Las dos probabilidades.
            </strong>{" "}
            La final
            {shap && ` (${porcentaje(shap.final)})`} es la confianza del
            modelo, la misma del panel de decisión. La de partida
            {shap && ` (${porcentaje(shap.base)})`} es lo que el modelo le
            asigna a una interconsulta con todos los campos vacíos. La
            diferencia entre las dos es lo que se reparte entre los campos.
          </p>
          <p>
            <strong className="text-[var(--pz-ink)]">Cómo se reparte.</strong>{" "}
            Con el método SHAP: se le pide al modelo una predicción para cada
            una de las 256 combinaciones de campos presentes y ausentes, y a
            cada campo le toca lo que cambia la probabilidad cuando está. Es un
            cálculo exacto, no una muestra: los aportes suman justo la
            diferencia.
          </p>
          <p>
            <strong className="text-[var(--pz-ink)]">Las palabras.</strong>{" "}
            El peso de cada palabra es cuánto cambia la probabilidad si se borra
            solo esa palabra y el resto queda igual. Por eso las palabras de un
            campo no suman su total: si dos dicen lo mismo, borrar una sola
            cambia poco porque la otra la cubre. Las especialidades, la edad y el
            sexo son un valor y no texto libre, así que van enteros y valen el
            total del campo, igual que un campo de una sola palabra.
          </p>
          <p>
            <strong className="text-[var(--pz-ink)]">Mucho, algo, poco.</strong>{" "}
            Mucho es 10 puntos o más; algo, de 3 a 10; poco, menos de 3.
          </p>
          <p>
            <strong className="text-[var(--pz-ink)]">Qué no dice.</strong>{" "}
            Muestra qué usó el modelo, no si eso es clínicamente correcto. Un
            campo puede pesar por un patrón de los datos con que se entrenó y no
            por su contenido clínico. La decisión sigue siendo del médico.
          </p>
        </div>
      </details>
    </div>
  );
}
