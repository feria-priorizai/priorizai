import { beforeEach, describe, expect, it, vi } from "vitest";
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
  urlDescargaVersion,
} from "@/services/reentrenamiento";
import { respuestaJson } from "./fabricas";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function llamada(indice = 0): [string, RequestInit] {
  return fetchMock.mock.calls[indice] as [string, RequestInit];
}

describe("lecturas del módulo de reentrenamiento", () => {
  it.each([
    ["resumen", obtenerResumen, "/api/reentrenamiento/resumen"],
    ["historial", listarReentrenamientos, "/api/reentrenamiento/trabajos"],
    ["versiones", listarVersiones, "/api/reentrenamiento/versiones"],
    ["cambios", listarCambios, "/api/reentrenamiento/cambios"],
    ["archivos con datos", listarArchivosDatos, "/api/reentrenamiento/datos"],
  ])("pide el %s sin caché", async (_nombre, funcion, ruta) => {
    fetchMock.mockResolvedValue(respuestaJson({ ok: true }));

    await expect((funcion as () => Promise<unknown>)()).resolves.toEqual({ ok: true });

    const [url, init] = llamada();
    expect(url).toBe(ruta);
    expect(init.cache).toBe("no-store");
  });

  it("codifica el id al pedir un reentrenamiento", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ id: "a/b" }));

    await obtenerReentrenamiento("a/b");

    expect(llamada()[0]).toBe("/api/reentrenamiento/trabajos/a%2Fb");
  });

  it("muestra el detalle del backend cuando falla", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ detail: "Solo un administrador" }, { status: 403 }));

    await expect(obtenerResumen()).rejects.toThrow("Solo un administrador");
  });

  it("usa un mensaje propio si el backend no explica el error", async () => {
    fetchMock.mockResolvedValue(new Response("caído", { status: 502 }));

    await expect(listarVersiones()).rejects.toThrow("No se pudo cargar la lista de versiones");
  });
});

describe("acciones del módulo de reentrenamiento", () => {
  it("inicia un reentrenamiento con la solicitud en JSON", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ id: "re-1", estado: "en_curso" }, { status: 202 }));
    const solicitud = {
      dispositivo: "gpu" as const,
      automatico: false,
      porcentaje_evaluacion: 20,
      configuraciones: [
        { epocas: 3, learning_rate: 2e-5, batch_size: 16, max_length: 256, paciencia: 2 },
      ],
      usar_revisadas: false,
      archivos: ["a-1"],
    };

    await expect(iniciarReentrenamiento(solicitud)).resolves.toMatchObject({ id: "re-1" });

    const [url, init] = llamada();
    expect(url).toBe("/api/reentrenamiento/trabajos");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(solicitud);
  });

  it("explica por qué no pudo iniciar", async () => {
    fetchMock.mockResolvedValue(
      respuestaJson({ detail: "Ya hay un reentrenamiento en curso." }, { status: 409 }),
    );

    await expect(
      iniciarReentrenamiento({
        dispositivo: "cpu",
        automatico: true,
        porcentaje_evaluacion: 20,
        configuraciones: [],
        usar_revisadas: true,
        archivos: [],
      }),
    ).rejects.toThrow("Ya hay un reentrenamiento en curso.");
  });

  it("cancela por id", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ status: "cancelando" }, { status: 202 }));

    await cancelarReentrenamiento("re-1");

    expect(llamada()[0]).toBe("/api/reentrenamiento/trabajos/re-1/cancelar");
    expect(llamada()[1].method).toBe("POST");
  });

  it("informa si no pudo cancelar", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ detail: "no está en curso" }, { status: 409 }));

    await expect(cancelarReentrenamiento("re-1")).rejects.toThrow("no está en curso");
  });

  it("activa una versión", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ accion: "revertir" }));

    await expect(activarVersion("v-1")).resolves.toEqual({ accion: "revertir" });

    expect(llamada()[0]).toBe("/api/reentrenamiento/versiones/v-1/activar");
  });

  it("informa si no pudo activar", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ detail: "ya está en uso" }, { status: 409 }));

    await expect(activarVersion("v-1")).rejects.toThrow("ya está en uso");
  });

  it("sube el zip con nombre y orden de clases", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ id: "v-2" }, { status: 201 }));
    const archivo = new File(["zip"], "modelo.zip", { type: "application/zip" });

    await subirVersion(archivo, { nombre: " Hospital X ", ordenClases: "baja,media,alta" });

    const [url, init] = llamada();
    expect(url).toBe("/api/reentrenamiento/versiones/subir");
    const cuerpo = init.body as FormData;
    expect(cuerpo.get("archivo")).toBeInstanceOf(File);
    expect(cuerpo.get("nombre")).toBe("Hospital X");
    expect(cuerpo.get("orden_clases")).toBe("baja,media,alta");
  });

  it("no manda los campos opcionales vacíos", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ id: "v-2" }, { status: 201 }));

    await subirVersion(new File(["zip"], "modelo.zip"));

    const cuerpo = llamada()[1].body as FormData;
    expect(cuerpo.has("nombre")).toBe(false);
    expect(cuerpo.has("orden_clases")).toBe(false);
  });

  it("informa si el modelo subido no sirve", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ detail: "Solo .safetensors" }, { status: 422 }));

    await expect(subirVersion(new File(["x"], "m.zip"))).rejects.toThrow("Solo .safetensors");
  });

  it("sube un archivo con interconsultas priorizadas", async () => {
    fetchMock.mockResolvedValue(
      respuestaJson({ archivo: { id: "a-1" }, rechazadas: [] }, { status: 201 }),
    );
    const archivo = new File(["HISTORIA_CLINICA,PRIORIDAD"], "datos.csv");

    await expect(subirArchivoDatos(archivo)).resolves.toMatchObject({ archivo: { id: "a-1" } });

    const [url, init] = llamada();
    expect(url).toBe("/api/reentrenamiento/datos");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("archivo")).toBe(archivo);
  });

  it("explica por qué no aceptó el archivo", async () => {
    fetchMock.mockResolvedValue(
      respuestaJson({ detail: "Faltan columnas obligatorias: PRIORIDAD." }, { status: 422 }),
    );

    await expect(subirArchivoDatos(new File(["x"], "datos.csv"))).rejects.toThrow(
      "Faltan columnas obligatorias",
    );
  });

  it("borra un archivo por id", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await eliminarArchivoDatos("a/1");

    const [url, init] = llamada();
    expect(url).toBe("/api/reentrenamiento/datos/a%2F1");
    expect(init.method).toBe("DELETE");
  });

  it("informa si no pudo borrar el archivo", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));

    await expect(eliminarArchivoDatos("a-1")).rejects.toThrow("No se pudo borrar el archivo");
  });

  it("arma la URL de descarga", () => {
    expect(urlDescargaVersion("v 1")).toBe("/api/reentrenamiento/versiones/v%201/descargar");
  });
});
