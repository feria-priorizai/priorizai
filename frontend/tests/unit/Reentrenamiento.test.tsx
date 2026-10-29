import { useState, type ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FormularioReentrenamiento from "@/components/reentrenamiento/FormularioReentrenamiento";
import PanelEjecucion, { formatearDuracion } from "@/components/reentrenamiento/PanelEjecucion";
import type {
  ArchivoEntrenamiento,
  Metricas,
  Reentrenamiento,
  ResumenReentrenamiento,
  SubidaArchivo,
  VersionModelo,
} from "@/types/reentrenamiento";

const POR_DEFECTO = { epocas: 4, learning_rate: 2e-5, batch_size: 16, max_length: 256, paciencia: 2 };

function resumen(parcial: Partial<ResumenReentrenamiento> = {}): ResumenReentrenamiento {
  return {
    registros_disponibles: 240,
    registros_por_clase: { baja: 100, media: 80, alta: 60 },
    minimo: 100,
    minimo_por_clase: 5,
    puede_iniciar: true,
    motivo_bloqueo: null,
    bloqueo_general: null,
    gpu_disponible: true,
    servicio_remoto: false,
    modelo_base: "PlanTL-GOB-ES/bsc-bio-ehr-es",
    en_curso_id: null,
    maximo_configuraciones: 3,
    parametros_por_defecto: POR_DEFECTO,
    ...parcial,
  };
}

function metricas(f1: number, sensibilidad = 0.8): Metricas {
  return {
    n: 48,
    exactitud: 0.75,
    f1_macro: f1,
    sensibilidad_alta: sensibilidad,
    f1_por_clase: {},
    matriz_confusion: [],
  };
}

function reentrenamiento(parcial: Partial<Reentrenamiento> = {}): Reentrenamiento {
  return {
    id: "re-1",
    estado: "en_curso",
    dispositivo: "gpu",
    automatico: false,
    configuraciones: [POR_DEFECTO],
    porcentaje_evaluacion: 20,
    n_registros: 240,
    registros_por_clase: { baja: 100, media: 80, alta: 60 },
    n_evaluacion: 48,
    version_base_id: "v-0",
    progreso: {
      etapa: "Entrenando configuración 1 de 2",
      porcentaje: 37.4,
      segundos_transcurridos: 120,
      segundos_restantes: 3720,
      epoca: 2,
      epocas: 4,
    },
    error: null,
    resultados: null,
    iniciado_por: "Admin Test",
    created_at: "2026-10-21T03:00:00",
    terminado_en: null,
    log: "Configuración 1 · época 1/4: pérdida 0.9",
    ...parcial,
  };
}

function version(parcial: Partial<VersionModelo> = {}): VersionModelo {
  return {
    id: "v-1",
    nombre: "Reentrenamiento 2026-10-21 03:00",
    ruta: "/models/versiones/re-1/configuracion_1",
    origen: "reentrenamiento",
    labels: ["baja", "media", "alta"],
    metricas: null,
    parametros: null,
    n_registros: 240,
    reentrenamiento_id: "re-1",
    activa: false,
    creado_por: "Admin Test",
    created_at: "2026-10-21T04:00:00",
    disponible: true,
    ...parcial,
  };
}

function archivo(parcial: Partial<ArchivoEntrenamiento> = {}): ArchivoEntrenamiento {
  return {
    id: "a-1",
    nombre: "historico.xlsx",
    n_registros: 300,
    registros_por_clase: { baja: 150, media: 100, alta: 50 },
    n_rechazadas: 0,
    creado_por: "Admin Test",
    created_at: "2026-10-29T15:00:00",
    ...parcial,
  };
}

type PropsFormulario = ComponentProps<typeof FormularioReentrenamiento>;

function renderFormulario(props: Partial<PropsFormulario> = {}) {
  const todas: PropsFormulario = {
    resumen: resumen(),
    archivos: [],
    enviando: false,
    onIniciar: vi.fn(),
    onSubirArchivo: vi.fn().mockResolvedValue(null),
    onEliminarArchivo: vi.fn(),
    ...props,
  };
  render(<FormularioReentrenamiento {...todas} />);
  return todas;
}

/** Como ModuloReentrenamiento: al subir, recarga la lista de archivos. */
function ConPadre({ subida, onIniciar }: { subida: SubidaArchivo; onIniciar: () => void }) {
  const [archivos, setArchivos] = useState<ArchivoEntrenamiento[]>([]);
  return (
    <FormularioReentrenamiento
      resumen={resumen()}
      archivos={archivos}
      enviando={false}
      onIniciar={onIniciar}
      onSubirArchivo={async () => {
        setArchivos([subida.archivo]);
        return subida;
      }}
      onEliminarArchivo={vi.fn()}
    />
  );
}

describe("FormularioReentrenamiento", () => {
  it("por defecto deja que el sistema elija y manda una solicitud automática", async () => {
    const usuario = userEvent.setup();
    const { onIniciar } = renderFormulario();

    expect(screen.getByTestId("registros-disponibles")).toHaveTextContent("240");
    await usuario.click(screen.getByTestId("iniciar-reentrenamiento"));

    expect(onIniciar).toHaveBeenCalledWith({
      dispositivo: "gpu",
      automatico: true,
      porcentaje_evaluacion: 20,
      configuraciones: [],
      usar_revisadas: true,
      archivos: [],
    });
  });

  it("permite configurar dos entrenamientos en CPU", async () => {
    const usuario = userEvent.setup();
    const { onIniciar } = renderFormulario();

    await usuario.click(screen.getByTestId("dispositivo-cpu"));
    await usuario.click(screen.getByTestId("modo-manual"));
    await usuario.click(screen.getByTestId("cantidad-2"));
    const segunda = screen.getByTestId("configuracion-2");
    const epocas = within(segunda).getByLabelText("Épocas");
    await usuario.clear(epocas);
    await usuario.type(epocas, "6");
    await usuario.click(screen.getByTestId("iniciar-reentrenamiento"));

    expect(screen.queryByTestId("configuracion-3")).not.toBeInTheDocument();
    expect(onIniciar).toHaveBeenCalledWith({
      dispositivo: "cpu",
      automatico: false,
      porcentaje_evaluacion: 20,
      configuraciones: [POR_DEFECTO, { ...POR_DEFECTO, epocas: 6 }],
      usar_revisadas: true,
      archivos: [],
    });
  });

  it("al bajar la cantidad conserva lo ya configurado en los primeros", async () => {
    const usuario = userEvent.setup();
    const { onIniciar } = renderFormulario();

    await usuario.click(screen.getByTestId("modo-manual"));
    const epocas = within(screen.getByTestId("configuracion-1")).getByLabelText("Épocas");
    await usuario.clear(epocas);
    await usuario.type(epocas, "8");
    await usuario.click(screen.getByTestId("cantidad-3"));
    await usuario.click(screen.getByTestId("cantidad-1"));
    await usuario.click(screen.getByTestId("iniciar-reentrenamiento"));

    expect(vi.mocked(onIniciar).mock.calls[0][0].configuraciones).toEqual([
      { ...POR_DEFECTO, epocas: 8 },
    ]);
  });

  it("sin GPU parte en CPU y no deja elegir GPU", () => {
    renderFormulario({ resumen: resumen({ gpu_disponible: false }) });

    expect(screen.getByTestId("dispositivo-gpu")).toBeDisabled();
    expect(screen.getByTestId("dispositivo-cpu")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/puede tardar varias horas/)).toBeInTheDocument();
  });

  it("con pocos datos explica el motivo y no deja iniciar", () => {
    renderFormulario({
      resumen: resumen({
        registros_disponibles: 12,
        registros_por_clase: { baja: 4, media: 4, alta: 4 },
      }),
    });

    expect(screen.getByTestId("motivo-bloqueo")).toHaveTextContent(
      "Hay 12 interconsultas con prioridad para entrenar y se necesitan al menos 100.",
    );
    expect(screen.getByTestId("iniciar-reentrenamiento")).toBeDisabled();
  });

  it("si falta una prioridad dice cuál", () => {
    renderFormulario({
      resumen: resumen({ registros_por_clase: { baja: 200, media: 38, alta: 2 } }),
    });

    expect(screen.getByTestId("motivo-bloqueo")).toHaveTextContent("Faltan de: alta.");
  });

  it("con un bloqueo general no deja iniciar aunque haya datos", () => {
    renderFormulario({
      resumen: resumen({ bloqueo_general: "Ya hay un reentrenamiento en curso." }),
    });

    expect(screen.getByTestId("motivo-bloqueo")).toHaveTextContent(
      "Ya hay un reentrenamiento en curso.",
    );
    expect(screen.getByTestId("iniciar-reentrenamiento")).toBeDisabled();
  });

  it("suma un archivo elegido a las revisadas y lo manda en la solicitud", async () => {
    const usuario = userEvent.setup();
    const { onIniciar } = renderFormulario({ archivos: [archivo()] });

    await usuario.click(screen.getByLabelText("Usar historico.xlsx"));

    expect(screen.getByTestId("registros-disponibles")).toHaveTextContent("540");
    expect(screen.getByText("alta: 110")).toBeInTheDocument();
    await usuario.click(screen.getByTestId("iniciar-reentrenamiento"));
    expect(onIniciar).toHaveBeenCalledWith(
      expect.objectContaining({ usar_revisadas: true, archivos: ["a-1"] }),
    );
  });

  it("puede entrenar solo con un archivo, sin revisadas en la app", async () => {
    const usuario = userEvent.setup();
    const { onIniciar } = renderFormulario({
      resumen: resumen({
        registros_disponibles: 0,
        registros_por_clase: { baja: 0, media: 0, alta: 0 },
      }),
      archivos: [archivo()],
    });
    expect(screen.getByTestId("iniciar-reentrenamiento")).toBeDisabled();

    await usuario.click(screen.getByTestId("usar-revisadas"));
    await usuario.click(screen.getByLabelText("Usar historico.xlsx"));
    await usuario.click(screen.getByTestId("iniciar-reentrenamiento"));

    expect(onIniciar).toHaveBeenCalledWith(
      expect.objectContaining({ usar_revisadas: false, archivos: ["a-1"] }),
    );
  });

  it("sin ninguna fuente elegida pide elegir una", async () => {
    const usuario = userEvent.setup();
    renderFormulario();

    await usuario.click(screen.getByTestId("usar-revisadas"));

    expect(screen.getByTestId("motivo-bloqueo")).toHaveTextContent("Elige con qué datos entrenar");
    expect(screen.getByTestId("iniciar-reentrenamiento")).toBeDisabled();
  });

  it("lo recién subido queda elegido y se informan las filas rechazadas", async () => {
    const usuario = userEvent.setup();
    const onIniciar = vi.fn();
    const subida: SubidaArchivo = {
      archivo: archivo({ id: "a-2", nombre: "nuevo.csv", n_rechazadas: 2 }),
      rechazadas: [
        { fila: 4, motivo: "Sin prioridad." },
        { fila: 9, motivo: "Sin historia clínica." },
      ],
    };
    render(<ConPadre subida={subida} onIniciar={onIniciar} />);

    await usuario.upload(
      screen.getByLabelText(/Agregar un archivo/),
      new File(["x"], "nuevo.csv", { type: "text/csv" }),
    );
    await usuario.click(screen.getByTestId("subir-datos"));

    const resultado = await screen.findByTestId("resultado-subida-datos");
    expect(resultado).toHaveTextContent("Se cargaron 300 interconsultas de «nuevo.csv»");
    expect(resultado).toHaveTextContent("2 filas no se usaron");
    expect(resultado).toHaveTextContent("Fila 9: Sin historia clínica.");
    expect(screen.getByLabelText("Usar nuevo.csv")).toBeChecked();
    await usuario.click(screen.getByTestId("iniciar-reentrenamiento"));
    expect(onIniciar).toHaveBeenCalledWith(expect.objectContaining({ archivos: ["a-2"] }));
  });

  it("si la subida falla no cambia la selección", async () => {
    const usuario = userEvent.setup();
    const { onIniciar } = renderFormulario();

    await usuario.upload(screen.getByLabelText(/Agregar un archivo/), new File(["x"], "malo.csv"));
    await usuario.click(screen.getByTestId("subir-datos"));
    await usuario.click(screen.getByTestId("iniciar-reentrenamiento"));

    expect(screen.queryByTestId("resultado-subida-datos")).not.toBeInTheDocument();
    expect(onIniciar).toHaveBeenCalledWith(expect.objectContaining({ archivos: [] }));
  });

  it("borrar un archivo pasa por el padre", async () => {
    const usuario = userEvent.setup();
    const { onEliminarArchivo } = renderFormulario({ archivos: [archivo()] });

    await usuario.click(screen.getByRole("button", { name: "Borrar historico.xlsx" }));

    expect(onEliminarArchivo).toHaveBeenCalledWith(archivo());
  });
});

describe("PanelEjecucion", () => {
  it("en curso muestra la etapa, el avance, el log y deja cancelar", async () => {
    const usuario = userEvent.setup();
    const onCancelar = vi.fn();
    render(
      <PanelEjecucion
        reentrenamiento={reentrenamiento()}
        versiones={[]}
        ocupado={null}
        onCancelar={onCancelar}
        onActivar={vi.fn()}
      />,
    );

    expect(screen.getByTestId("estado-reentrenamiento")).toHaveTextContent("En curso");
    expect(screen.getByText(/época 2 de 4/)).toBeInTheDocument();
    expect(screen.getByTestId("porcentaje-avance")).toHaveTextContent("37%");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "37");
    expect(screen.getByText(/Restante\s+aproximado: 1 h 2 min/)).toBeInTheDocument();
    expect(screen.getByTestId("log-reentrenamiento")).toHaveTextContent("época 1/4");

    await usuario.click(screen.getByTestId("cancelar-reentrenamiento"));
    expect(onCancelar).toHaveBeenCalled();
  });

  it("terminado compara contra el modelo en uso y deja activar el nuevo", async () => {
    const usuario = userEvent.setup();
    const onActivar = vi.fn();
    const nueva = version();
    render(
      <PanelEjecucion
        reentrenamiento={reentrenamiento({
          estado: "terminado",
          resultados: {
            modelo_actual: metricas(0.7, 0.85),
            configuraciones: [
              {
                indice: 0,
                version_id: "v-1",
                parametros: POR_DEFECTO,
                metricas: metricas(0.78, 0.8),
                mejor_epoca: 3,
                epocas_corridas: 4,
              },
            ],
          },
        })}
        versiones={[nueva]}
        ocupado={null}
        onCancelar={vi.fn()}
        onActivar={onActivar}
      />,
    );

    const tabla = screen.getByTestId("tabla-comparacion");
    expect(within(tabla).getByText("Modelo nuevo")).toBeInTheDocument();
    expect(within(tabla).getByText("70.0%")).toBeInTheDocument();
    expect(within(tabla).getByText("78.0%")).toBeInTheDocument();
    expect(within(tabla).getByText("▲ 8.0 pts")).toBeInTheDocument();
    expect(within(tabla).getByText("▼ 5.0 pts")).toBeInTheDocument();
    expect(screen.queryByTestId("cancelar-reentrenamiento")).not.toBeInTheDocument();

    await usuario.click(screen.getByTestId("activar-resultado-1"));
    expect(onActivar).toHaveBeenCalledWith(nueva);
  });

  it("marca la mejor de varias configuraciones y la que ya está en uso", () => {
    render(
      <PanelEjecucion
        reentrenamiento={reentrenamiento({
          estado: "terminado",
          resultados: {
            modelo_actual: null,
            configuraciones: [0.6, 0.8].map((f1, indice) => ({
              indice,
              version_id: `v-${indice + 1}`,
              parametros: POR_DEFECTO,
              metricas: metricas(f1),
              mejor_epoca: 1,
              epocas_corridas: 1,
            })),
          },
        })}
        versiones={[version({ id: "v-1", activa: true }), version({ id: "v-2" })]}
        ocupado={null}
        onCancelar={vi.fn()}
        onActivar={vi.fn()}
      />,
    );

    const tabla = screen.getByTestId("tabla-comparacion");
    expect(within(tabla).getByText("Entrenamiento 2")).toHaveTextContent("mejor F1");
    expect(within(tabla).getByText("En uso")).toBeInTheDocument();
    expect(screen.getByText(/no hay\s+contra qué comparar/)).toBeInTheDocument();
  });

  it("muestra el error de un reentrenamiento fallido", () => {
    render(
      <PanelEjecucion
        reentrenamiento={reentrenamiento({ estado: "error", error: "CUDA out of memory" })}
        versiones={[]}
        ocupado={null}
        onCancelar={vi.fn()}
        onActivar={vi.fn()}
      />,
    );

    expect(screen.getByTestId("estado-reentrenamiento")).toHaveTextContent("Error");
    expect(screen.getByRole("alert")).toHaveTextContent("CUDA out of memory");
  });
});

describe("formatearDuracion", () => {
  it.each([
    [null, "calculando…"],
    [42, "42 s"],
    [125, "2 min"],
    [7260, "2 h 1 min"],
  ])("%s segundos → %s", (segundos, texto) => {
    expect(formatearDuracion(segundos)).toBe(texto);
  });
});
