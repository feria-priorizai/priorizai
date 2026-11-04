import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardarPlazosRevision, obtenerPlazosRevision } from "@/services/plazos";
import {
  errorDePlazo,
  ordenarPorAtraso,
  PLAZO_MAXIMO,
  textoDias,
  validarPlazos,
} from "@/utils/plazos";
import { crearInterconsulta, respuestaJson } from "./fabricas";

describe("validarPlazos (HDU-22)", () => {
  it("acepta enteros positivos de la prioridad más alta a la más baja", () => {
    expect(validarPlazos({ alta: "5", media: " 15 ", baja: "30" })).toEqual({
      ok: true,
      plazos: { alta: 5, media: 15, baja: 30 },
    });
  });

  it("acepta plazos iguales entre prioridades", () => {
    expect(validarPlazos({ alta: "10", media: "10", baja: "10" }).ok).toBe(true);
  });

  it("rechaza un plazo inválido y señala el campo", () => {
    expect(validarPlazos({ alta: "5", media: "0", baja: "30" })).toEqual({
      ok: false,
      nivel: "media",
      error: "Valor inválido: el plazo debe ser mayor que 0 días.",
    });
  });

  it("rechaza un plazo sobre el máximo", () => {
    const resultado = validarPlazos({ alta: "5", media: "15", baja: String(PLAZO_MAXIMO + 1) });
    expect(resultado).toMatchObject({ ok: false, nivel: "baja" });
  });

  it.each([
    [{ alta: "20", media: "15", baja: "30" }, "alta", "media"],
    [{ alta: "5", media: "40", baja: "30" }, "media", "baja"],
  ] as const)(
    "rechaza una prioridad más alta con más días que una más baja",
    (valores, masAlta, masBaja) => {
      expect(validarPlazos(valores)).toEqual({
        ok: false,
        nivel: masAlta,
        error: `El plazo de prioridad ${masAlta} no puede ser mayor que el de prioridad ${masBaja}.`,
      });
    },
  );
});

describe("errorDePlazo", () => {
  it.each(["0", "-3", " -1 "])("avisa que %j es inválido por no ser mayor que 0", (valor) => {
    expect(errorDePlazo(valor)).toBe("Valor inválido: el plazo debe ser mayor que 0 días.");
  });

  it.each(["5.5", "1e2"])("exige un entero de días en %j", (valor) => {
    expect(errorDePlazo(valor)).toBe(
      "Valor inválido: el plazo debe ser un número entero de días.",
    );
  });

  it("avisa cuando no es un número o está vacío", () => {
    expect(errorDePlazo("cinco")).toBe("Valor inválido: ingresa un número de días.");
    expect(errorDePlazo("  ")).toBe("Ingresa el plazo en días.");
  });

  it("acepta enteros de 1 hasta el máximo", () => {
    expect(errorDePlazo("1")).toBeNull();
    expect(errorDePlazo(String(PLAZO_MAXIMO))).toBeNull();
  });
});

describe("ordenarPorAtraso", () => {
  it("ordena de mayor a menor atraso y conserva el orden ante empates", () => {
    const lista = [
      crearInterconsulta({ id: "a", diasAtraso: 2 }),
      crearInterconsulta({ id: "b", diasAtraso: 9 }),
      crearInterconsulta({ id: "c", diasAtraso: 2 }),
      crearInterconsulta({ id: "d", diasAtraso: null }),
    ];

    expect(ordenarPorAtraso(lista).map((ic) => ic.id)).toEqual(["b", "a", "c", "d"]);
    expect(lista.map((ic) => ic.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("textoDias", () => {
  it("usa singular para un día", () => {
    expect(textoDias(1)).toBe("1 día");
    expect(textoDias(12)).toBe("12 días");
  });
});

describe("servicio de plazos", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("lee los plazos vigentes", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ alta: 5, media: 15, baja: 30 }));

    await expect(obtenerPlazosRevision()).resolves.toEqual({ alta: 5, media: 15, baja: 30 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plazos-revision",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("avisa si no puede leerlos", async () => {
    fetchMock.mockResolvedValue(respuestaJson({}, { status: 500 }));

    await expect(obtenerPlazosRevision()).rejects.toThrow(
      "No se pudieron cargar los plazos de revisión",
    );
  });

  it("guarda los tres plazos con PUT", async () => {
    fetchMock.mockResolvedValue(respuestaJson({ alta: 3, media: 10, baja: 20 }));

    await expect(guardarPlazosRevision({ alta: 3, media: 10, baja: 20 })).resolves.toEqual({
      alta: 3,
      media: 10,
      baja: 20,
    });
    const [ruta, init] = fetchMock.mock.calls[0];
    expect(ruta).toBe("/api/plazos-revision");
    expect(init).toMatchObject({ method: "PUT" });
    expect(JSON.parse(init.body)).toEqual({ alta: 3, media: 10, baja: 20 });
  });

  it("muestra el motivo del rechazo que da el backend", async () => {
    fetchMock.mockResolvedValue(
      respuestaJson(
        { detail: "Solo un administrador puede realizar esta acción" },
        { status: 403 },
      ),
    );

    await expect(guardarPlazosRevision({ alta: 1, media: 1, baja: 1 })).rejects.toThrow(
      "Solo un administrador puede realizar esta acción",
    );
  });

  it("usa un mensaje genérico si la respuesta no trae motivo", async () => {
    fetchMock.mockResolvedValue(new Response("caído", { status: 502 }));

    await expect(guardarPlazosRevision({ alta: 1, media: 1, baja: 1 })).rejects.toThrow(
      "No se pudieron guardar los plazos de revisión",
    );
  });
});
