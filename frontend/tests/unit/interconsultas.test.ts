import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consultarExplicacion,
  modificarEstadoInterconsulta,
  modificarPrioridad,
  obtenerInterconsultaPorId,
  obtenerInterconsultas,
  pedirExplicacion,
  priorizarInterconsulta,
  reevaluarBanderasRojas,
  subirCsvInterconsultas,
} from "@/services/interconsultas";
import { respuestaJson } from "./fabricas";

/** Interconsulta tal como la devuelve la API. */
function crearApi(parcial: Record<string, unknown> = {}) {
  return {
    id: "ic-1",
    espec_origen: "Medicina General",
    edad: 67,
    sexo: "Femenino",
    espec_destino: "Cardiología",
    prioridad_original_csv: null,
    historia_clinica: "  Dolor torácico al esfuerzo ",
    fundamentos_diagnostico: "Angina",
    examenes_complementarios: null,
    motivo_interconsulta: "Evaluación",
    prioridad_sugerida_modelo: "Media",
    confianza_modelo: 81,
    prob_baja: 0.05,
    prob_media: 0.81,
    prob_alta: 0.14,
    prioridad_actual: "ALTA",
    estado: "Revisada",
    motivo_sin_prioridad: null,
    fecha_emision: "2026-09-30",
    bandera_roja: true,
    terminos_bandera_roja: "dolor_toracico",
    terminos_bandera_roja_nombres: ["Dolor torácico"],
    prioridad_forzada_por_regla: true,
    created_at: "2026-10-01T12:00:00",
    updated_at: "2026-10-02T12:00:00",
    ...parcial,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("mapeo de la API", () => {
  it("normaliza prioridad, estado, textos y banderas", async () => {
    fetchMock.mockResolvedValue(respuestaJson(crearApi()));

    const ic = await obtenerInterconsultaPorId("ic-1");

    expect(ic).toMatchObject({
      id: "ic-1",
      pacienteEdad: 67,
      especialidad: "Cardiología",
      centroOrigen: "Medicina General",
      diagnostico: "Dolor torácico al esfuerzo",
      estado: "revisada",
      prioridadActual: "alta",
      sinPrioridad: false,
      banderaRoja: true,
      terminosBanderaRoja: ["Dolor torácico"],
      prioridadForzadaPorRegla: true,
      esValidaParaPriorizacion: true,
      entidades: null,
      explicacion: null,
    });
    expect(ic?.priorizacionIA).toMatchObject({
      nivelSugerido: "media",
      confianza: 81,
      priorizada: true,
      probabilidades: { baja: 0.05, media: 0.81, alta: 0.14 },
    });
  });

  it("marca sin prioridad y no priorizable cuando no hay datos clínicos", async () => {
    fetchMock.mockResolvedValue(
      respuestaJson(
        crearApi({
          prioridad_sugerida_modelo: null,
          prioridad_actual: null,
          confianza_modelo: null,
          prob_baja: null,
          prob_media: null,
          prob_alta: null,
          historia_clinica: " ",
          fundamentos_diagnostico: "",
          motivo_interconsulta: "",
          estado: "pendiente",
          terminos_bandera_roja_nombres: undefined,
        }),
      ),
    );

    const ic = await obtenerInterconsultaPorId("ic-1");

    expect(ic).toMatchObject({
      sinPrioridad: true,
      prioridadActual: "baja",
      esValidaParaPriorizacion: false,
      diagnostico: "Sin diagnostico registrado",
      motivoInterconsulta: "Sin motivo de interconsulta registrado",
      terminosBanderaRoja: [],
      estado: "pendiente",
    });
    expect(ic?.priorizacionIA.priorizada).toBe(false);
    expect(ic?.priorizacionIA.confianza).toBe(0);
  });

  it("traduce el historial de modificaciones", async () => {
    fetchMock.mockResolvedValue(
      respuestaJson(
        crearApi({
          modificaciones: [
            {
              id: "m-1",
              prioridad_anterior: null,
              prioridad_nueva: "Baja",
              motivo: "Paciente estable",
              medico_responsable: "Dra. Soto",
              created_at: "2026-10-03T10:00:00",
            },
          ],
        }),
      ),
    );

    const ic = await obtenerInterconsultaPorId("ic-1");

    expect(ic?.historialModificaciones).toEqual([
      {
        id: "m-1",
        prioridadAnterior: "alta",
        prioridadNueva: "baja",
        motivo: "Paciente estable",
        medicoResponsable: "Dra. Soto",
        fecha: "2026-10-03T10:00:00",
      },
    ]);
  });
});

describe("obtenerInterconsultas", () => {
  it("pide todas las páginas hasta completar el total informado", async () => {
    const pagina = (desde: number, cantidad: number) =>
      Array.from({ length: cantidad }, (_, i) => crearApi({ id: `ic-${desde + i}` }));
    fetchMock
      .mockResolvedValueOnce(respuestaJson(pagina(0, 100), { headers: { "X-Total-Count": "150" } }))
      .mockResolvedValueOnce(respuestaJson(pagina(100, 50), { headers: { "X-Total-Count": "150" } }));

    const listado = await obtenerInterconsultas();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/interconsultas?limit=100&offset=100");
    expect(listado.interconsultas).toHaveLength(150);
    expect(listado).toMatchObject({ total: 150, truncado: false });
  });

  it("usa el largo de la lista si el backend no informa el total", async () => {
    fetchMock.mockResolvedValue(respuestaJson([crearApi()]));

    await expect(obtenerInterconsultas()).resolves.toMatchObject({ total: 1, truncado: false });
  });

  it("falla con un mensaje claro si la API responde con error", async () => {
    fetchMock.mockResolvedValue(respuestaJson({}, { status: 500 }));
    await expect(obtenerInterconsultas()).rejects.toThrow("Error al cargar las interconsultas");
  });
});

describe("detalle", () => {
  it("devuelve null si la interconsulta no existe", async () => {
    fetchMock.mockResolvedValue(respuestaJson({}, { status: 404 }));
    await expect(obtenerInterconsultaPorId("no-existe")).resolves.toBeNull();
  });

  it("falla ante otros errores", async () => {
    fetchMock.mockResolvedValue(respuestaJson({}, { status: 500 }));
    await expect(obtenerInterconsultaPorId("ic-1")).rejects.toThrow("Error al cargar la interconsulta");
  });
});

describe("explicación", () => {
  it("pide la explicación y fuerza el recálculo si se indica", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ estado: "en_cola" }));

    await pedirExplicacion("ic-1", true);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/interconsultas/ic-1/explicacion?forzar=true");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("consulta el estado de la explicación", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ estado: "lista" }));
    await expect(consultarExplicacion("ic-1")).resolves.toEqual({ estado: "lista" });
  });

  it("muestra el error del backend al consultar", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ detail: "Sin modelo" }, { status: 503 }));
    await expect(consultarExplicacion("ic-1")).rejects.toThrow("Sin modelo");
  });
});

describe("priorizarInterconsulta", () => {
  it("prioriza y devuelve la interconsulta actualizada", async () => {
    fetchMock
      .mockResolvedValueOnce(respuestaJson({ total: 1, resultados: [] }))
      .mockResolvedValueOnce(respuestaJson(crearApi()));

    const ic = await priorizarInterconsulta("ic-1");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ids: ["ic-1"] });
    expect(ic.id).toBe("ic-1");
  });

  it("informa si el modelo no está disponible", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ detail: "Modelo no disponible" }, { status: 503 }));
    await expect(priorizarInterconsulta("ic-1")).rejects.toThrow("Modelo no disponible");
  });

  it("falla si la priorización no devuelve exactamente un resultado", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ total: 0, resultados: [] }));
    await expect(priorizarInterconsulta("ic-1")).rejects.toThrow("no retorno el resultado esperado");
  });

  it("falla si la interconsulta desaparece después de priorizar", async () => {
    fetchMock
      .mockResolvedValueOnce(respuestaJson({ total: 1, resultados: [] }))
      .mockResolvedValueOnce(respuestaJson({}, { status: 404 }));
    await expect(priorizarInterconsulta("ic-1")).rejects.toThrow("no encontrada despues de priorizar");
  });
});

describe("modificaciones", () => {
  it("reevalúa las banderas rojas", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ total_evaluadas: 3, total_con_bandera_roja: 1 }));
    await expect(reevaluarBanderasRojas()).resolves.toEqual({
      total_evaluadas: 3,
      total_con_bandera_roja: 1,
    });
  });

  it("informa si no pudo reevaluar las banderas", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 500 }));
    await expect(reevaluarBanderasRojas()).rejects.toThrow("No se pudo reevaluar las banderas rojas");
  });

  it("modifica la prioridad sin enviar el médico, que sale de la sesión", async () => {
    fetchMock.mockResolvedValue(respuestaJson(crearApi({ prioridad_actual: "baja" })));

    const ic = await modificarPrioridad("ic-1", "baja", "Paciente estable");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/interconsultas/ic-1/prioridad");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      prioridad: "baja",
      motivo: "Paciente estable",
    });
    expect(ic.prioridadActual).toBe("baja");
  });

  it("informa si no se pudo modificar la prioridad", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ detail: "El motivo es obligatorio" }, { status: 422 }));
    await expect(modificarPrioridad("ic-1", "alta", "")).rejects.toThrow("El motivo es obligatorio");
  });

  it("cambia el estado", async () => {
    fetchMock.mockResolvedValue(respuestaJson(crearApi({ estado: "revisada" })));
    await expect(modificarEstadoInterconsulta("ic-1", "revisada")).resolves.toMatchObject({
      estado: "revisada",
    });
  });

  it("informa si no se pudo cambiar el estado", async () => {
    fetchMock.mockResolvedValue(respuestaJson({}, { status: 500 }));
    await expect(modificarEstadoInterconsulta("ic-1", "revisada")).rejects.toThrow(
      "No se pudo actualizar el estado",
    );
  });
});

describe("subirCsvInterconsultas", () => {
  const archivo = new File(["EDAD\n40\n"], "carga.csv", { type: "text/csv" });

  it("envía el archivo y los campos obligatorios configurados", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ inserted: 1, rejected: [], rejected_count: 0 }));

    await subirCsvInterconsultas(archivo, ["EDAD", "SEXO"]);

    const cuerpo = fetchMock.mock.calls[0][1].body as FormData;
    expect(fetchMock.mock.calls[0][0]).toBe("/upload-csv");
    expect((cuerpo.get("file") as File).name).toBe("carga.csv");
    expect(cuerpo.get("campos_obligatorios")).toBe("EDAD,SEXO");
  });

  it("no envía campos obligatorios si no se configuraron", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ inserted: 1 }));

    await subirCsvInterconsultas(archivo);

    expect((fetchMock.mock.calls[0][1].body as FormData).has("campos_obligatorios")).toBe(false);
  });

  it("muestra el motivo del rechazo del archivo", async () => {
    fetchMock.mockResolvedValue(
      respuestaJson({ detail: { message: "Faltan columnas obligatorias" } }, { status: 400 }),
    );
    await expect(subirCsvInterconsultas(archivo)).rejects.toThrow("Faltan columnas obligatorias");
  });
});
