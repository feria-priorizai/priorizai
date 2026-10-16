import { describe, expect, it, vi } from "vitest";
import {
  agruparPorPrioridad,
  grupoDe,
  guardarOrdenLista,
  guardarVistaPreferida,
  leerOrdenLista,
  leerVistaPreferida,
  ordenarPorColumna,
} from "@/utils/ordenLista";
import { crearInterconsulta } from "./fabricas";

const alta = crearInterconsulta({ id: "c", prioridadActual: "alta", pacienteEdad: 70 });
const media = crearInterconsulta({ id: "a", prioridadActual: "media", pacienteEdad: 30 });
const baja = crearInterconsulta({ id: "b", prioridadActual: "baja", pacienteEdad: 50 });
const sinPrioridad = crearInterconsulta({ id: "d", sinPrioridad: true });
const invalida = crearInterconsulta({ id: "e", esValidaParaPriorizacion: false });

describe("grupoDe", () => {
  it("usa la prioridad vigente de las interconsultas priorizadas", () => {
    expect(grupoDe(alta)).toBe("alta");
    expect(grupoDe(baja)).toBe("baja");
  });

  it("separa las que no tienen prioridad y las que no se pueden priorizar", () => {
    expect(grupoDe(sinPrioridad)).toBe("sin");
    expect(grupoDe(invalida)).toBe("invalida");
  });
});

describe("agruparPorPrioridad", () => {
  it("ordena los grupos de alta a no priorizables y omite los vacíos", () => {
    const grupos = agruparPorPrioridad([invalida, baja, alta, sinPrioridad]);
    expect(grupos.map((g) => g.clave)).toEqual(["alta", "baja", "sin", "invalida"]);
  });

  it("conserva el orden del backend dentro de cada grupo", () => {
    const primera = crearInterconsulta({ id: "z", prioridadActual: "alta" });
    const segunda = crearInterconsulta({ id: "y", prioridadActual: "alta" });
    const [grupo] = agruparPorPrioridad([primera, segunda]);
    expect(grupo.items.map((ic) => ic.id)).toEqual(["z", "y"]);
  });
});

describe("ordenarPorColumna", () => {
  const lista = [media, alta, baja];
  const ids = (orden: typeof lista) => orden.map((ic) => ic.id);

  it("ordena ascendente y descendente por edad", () => {
    expect(ids(ordenarPorColumna(lista, { columna: "edad", descendente: false }))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(ids(ordenarPorColumna(lista, { columna: "edad", descendente: true }))).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("ordena la prioridad por gravedad y no alfabéticamente", () => {
    const orden = ordenarPorColumna(lista, { columna: "prioridad", descendente: false });
    expect(orden.map((ic) => ic.prioridadActual)).toEqual(["alta", "media", "baja"]);
  });

  it("pone la regla clínica sobre cualquier certeza y lo no priorizado al final", () => {
    const regla = crearInterconsulta({ id: "r", prioridadForzadaPorRegla: true });
    const noPriorizada = crearInterconsulta({
      id: "n",
      priorizacionIA: { ...media.priorizacionIA, priorizada: false },
    });
    const orden = ordenarPorColumna([noPriorizada, media, regla], {
      columna: "certeza",
      descendente: true,
    });
    expect(ids(orden)).toEqual(["r", "a", "n"]);
  });

  it.each(["folio", "diagnostico", "origen", "destino", "emision", "estado"] as const)(
    "ordena por %s sin modificar la lista original",
    (columna) => {
      const original = [...lista];
      const orden = ordenarPorColumna(lista, { columna, descendente: false });
      expect(orden).toHaveLength(3);
      expect(lista).toEqual(original);
    },
  );

  it("ordena por folio alfabéticamente", () => {
    expect(ids(ordenarPorColumna(lista, { columna: "folio", descendente: false }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("usa la fecha de ingreso si no hay fecha de emisión", () => {
    const sinEmision = crearInterconsulta({
      id: "x",
      fechaEmision: null,
      fechaIngreso: "2020-01-01",
    });
    const orden = ordenarPorColumna([media, sinEmision], {
      columna: "emision",
      descendente: false,
    });
    expect(orden[0].id).toBe("x");
  });

  it("mantiene el orden original ante empates", () => {
    const uno = crearInterconsulta({ id: "1", pacienteEdad: 40 });
    const dos = crearInterconsulta({ id: "2", pacienteEdad: 40 });
    expect(ids(ordenarPorColumna([uno, dos], { columna: "edad", descendente: true }))).toEqual([
      "1",
      "2",
    ]);
  });
});

describe("almacenamiento de la lista", () => {
  it("guarda y recupera la secuencia para navegar desde el detalle", () => {
    guardarOrdenLista(["a", "b"]);
    expect(leerOrdenLista()).toEqual(["a", "b"]);
  });

  it("descarta contenido corrupto o que no es una lista de ids", () => {
    sessionStorage.setItem("pz:orden-lista", "{no es json");
    expect(leerOrdenLista()).toEqual([]);
    sessionStorage.setItem("pz:orden-lista", JSON.stringify({ a: 1 }));
    expect(leerOrdenLista()).toEqual([]);
    sessionStorage.setItem("pz:orden-lista", JSON.stringify(["a", 3, null]));
    expect(leerOrdenLista()).toEqual(["a"]);
  });

  it("devuelve una lista vacía si nunca se guardó", () => {
    expect(leerOrdenLista()).toEqual([]);
  });

  it("recuerda la vista preferida por usuario", () => {
    expect(leerVistaPreferida("u1")).toBe("tarjetas");
    guardarVistaPreferida("u1", "tabla");
    expect(leerVistaPreferida("u1")).toBe("tabla");
    expect(leerVistaPreferida("u2")).toBe("tarjetas");
  });

  it("no rompe la vista si el almacenamiento no está disponible", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota llena");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("modo privado");
    });
    expect(() => guardarOrdenLista(["a"])).not.toThrow();
    expect(() => guardarVistaPreferida("u1", "tabla")).not.toThrow();
    expect(leerOrdenLista()).toEqual([]);
    expect(leerVistaPreferida("u1")).toBe("tarjetas");
  });
});
