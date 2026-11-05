import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aplicarPreferencias,
  escucharTemaDelSistema,
  guardarPreferenciasLocales,
  menuNoCabe,
  PREFERENCIAS_INICIALES,
  SCRIPT_PREFERENCIAS,
  temaDelSistema,
} from "@/utils/preferencias";

/** matchMedia de jsdom no existe: `oscuro` decide el tema del sistema y
 *  `ancho` responde las consultas por max-width. */
function simularPantalla({ oscuro = false, ancho = 1280 } = {}) {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal("matchMedia", (consulta: string) => {
    const maximo = /max-width: ([\d.]+)px/.exec(consulta);
    return {
      matches: maximo ? ancho <= Number(maximo[1]) : oscuro,
      addEventListener,
      removeEventListener,
    };
  });
  return { addEventListener, removeEventListener };
}

const raiz = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  simularPantalla();
});

afterEach(() => {
  for (const atributo of ["tema", "bsTheme", "letra", "modo"]) {
    delete raiz.dataset[atributo];
  }
});

describe("aplicarPreferencias", () => {
  it("escribe las tres preferencias como atributos de <html>", () => {
    aplicarPreferencias({
      tema: "oscuro",
      tamano_letra: "muy_grande",
      modo_interfaz: "legacy",
    });

    expect(raiz.dataset).toMatchObject({
      tema: "oscuro",
      bsTheme: "dark",
      letra: "muy_grande",
      modo: "legacy",
    });
  });

  it("sin tema elegido usa el del sistema operativo", () => {
    simularPantalla({ oscuro: true });

    aplicarPreferencias(PREFERENCIAS_INICIALES);

    expect(raiz.dataset.tema).toBe("oscuro");
  });

  it("una elección explícita le gana al sistema operativo", () => {
    simularPantalla({ oscuro: true });

    aplicarPreferencias({ ...PREFERENCIAS_INICIALES, tema: "claro" });

    expect(raiz.dataset.tema).toBe("claro");
    expect(raiz.dataset.bsTheme).toBe("light");
  });
});

describe("temaDelSistema", () => {
  it("distingue claro de oscuro", () => {
    expect(temaDelSistema()).toBe("claro");
    simularPantalla({ oscuro: true });
    expect(temaDelSistema()).toBe("oscuro");
  });
});

describe("escucharTemaDelSistema", () => {
  it("se suscribe y devuelve cómo dejar de escuchar", () => {
    const { addEventListener, removeEventListener } = simularPantalla();
    const alCambiar = vi.fn();

    const dejar = escucharTemaDelSistema(alCambiar);
    expect(addEventListener).toHaveBeenCalledWith("change", alCambiar);

    dejar();
    expect(removeEventListener).toHaveBeenCalledWith("change", alCambiar);
  });
});

describe("menuNoCabe", () => {
  it("el umbral crece con la letra: a 1280 px solo cabe hasta Grande", () => {
    simularPantalla({ ancho: 1280 });

    expect(menuNoCabe("normal")).toBe(false);
    expect(menuNoCabe("grande")).toBe(false);
    expect(menuNoCabe("muy_grande")).toBe(true);
  });
});

describe("SCRIPT_PREFERENCIAS", () => {
  const ejecutar = () => new Function(SCRIPT_PREFERENCIAS)();

  it("aplica lo mismo que aplicarPreferencias leyendo la copia local", () => {
    const preferencias = {
      tema: "oscuro",
      tamano_letra: "grande",
      modo_interfaz: "legacy",
    } as const;
    guardarPreferenciasLocales(preferencias);

    ejecutar();
    const delScript = { ...raiz.dataset };
    aplicarPreferencias(preferencias);

    expect(delScript).toEqual({ ...raiz.dataset });
  });

  it("sin copia local sigue al sistema operativo", () => {
    simularPantalla({ oscuro: true });

    ejecutar();

    expect(raiz.dataset).toMatchObject({
      tema: "oscuro",
      letra: "normal",
      modo: "estandar",
    });
  });

  it("una copia corrupta no impide cargar la página", () => {
    localStorage.setItem("pz:preferencias", "{no es json");

    expect(ejecutar).not.toThrow();
    expect(raiz.dataset.tema).toBe("claro");
  });
});

describe("guardarPreferenciasLocales", () => {
  it("no falla si el almacenamiento rechaza la escritura", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota llena");
    });

    expect(() =>
      guardarPreferenciasLocales(PREFERENCIAS_INICIALES),
    ).not.toThrow();
  });
});
