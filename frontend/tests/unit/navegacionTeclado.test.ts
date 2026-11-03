import { describe, expect, it } from "vitest";
import { enfocables, esTeclaLista, indiceDestino } from "@/utils/navegacionTeclado";

describe("esTeclaLista", () => {
  it("reconoce las flechas verticales, Inicio y Fin", () => {
    for (const tecla of ["ArrowDown", "ArrowUp", "Home", "End"]) {
      expect(esTeclaLista(tecla)).toBe(true);
    }
  });

  it("ignora el resto de las teclas", () => {
    for (const tecla of ["ArrowLeft", "Enter", "Tab", " ", "a"]) {
      expect(esTeclaLista(tecla)).toBe(false);
    }
  });
});

describe("indiceDestino", () => {
  it("avanza y retrocede de a una posición", () => {
    expect(indiceDestino("ArrowDown", 2, 5)).toBe(3);
    expect(indiceDestino("ArrowUp", 2, 5)).toBe(1);
  });

  it("se queda en los bordes en vez de dar la vuelta", () => {
    expect(indiceDestino("ArrowDown", 4, 5)).toBe(4);
    expect(indiceDestino("ArrowUp", 0, 5)).toBe(0);
  });

  it("salta al inicio y al final", () => {
    expect(indiceDestino("Home", 3, 5)).toBe(0);
    expect(indiceDestino("End", 1, 5)).toBe(4);
  });

  it("devuelve -1 si la lista está vacía", () => {
    expect(indiceDestino("ArrowDown", 0, 0)).toBe(-1);
  });
});

describe("enfocables", () => {
  it("devuelve solo lo que el tabulador alcanza, en orden", () => {
    const contenedor = document.createElement("div");
    contenedor.innerHTML = `
      <a href="/uno">uno</a>
      <a>sin destino</a>
      <button>dos</button>
      <button disabled>deshabilitado</button>
      <input type="hidden" />
      <input aria-label="tres" />
      <a href="/fuera" tabindex="-1">fuera del orden</a>
      <div tabindex="0">cuatro</div>
      <button hidden>oculto</button>
    `;

    expect(enfocables(contenedor).map((el) => el.textContent || el.getAttribute("aria-label"))).toEqual([
      "uno",
      "dos",
      "tres",
      "cuatro",
    ]);
  });
});
