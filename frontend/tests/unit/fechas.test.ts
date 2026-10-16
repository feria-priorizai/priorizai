import { describe, expect, it } from "vitest";
import {
  formatearFechaCalendario,
  formatearFechaCalendarioLarga,
  formatearFechaHoraChile,
  formatearFechaHoraChileLarga,
} from "@/utils/fechas";

// El texto exacto de la hora (12 o 24 h, "p. m.") depende de la versión de
// ICU del entorno, así que se comparan instantes equivalentes.
describe("fechas con hora", () => {
  it("interpreta como UTC las fechas del backend sin zona horaria", () => {
    expect(formatearFechaHoraChile("2026-10-01T15:30:00")).toBe(
      formatearFechaHoraChile("2026-10-01T15:30:00Z"),
    );
  });

  it("muestra la hora de Chile y no la del navegador", () => {
    // 02:00 UTC del 2 de octubre todavía es 1 de octubre en Chile (UTC-3).
    expect(formatearFechaHoraChile("2026-10-02T02:00:00Z")).toMatch(/^01-10-2026/);
  });

  it("respeta la zona horaria cuando viene explícita", () => {
    expect(formatearFechaHoraChile("2026-10-01T15:30:00-03:00")).toBe(
      formatearFechaHoraChile("2026-10-01T18:30:00Z"),
    );
  });

  it("usa el mes en palabras en el formato largo", () => {
    expect(formatearFechaHoraChileLarga("2026-10-01T15:30:00Z")).toMatch(/octubre/i);
  });
});

describe("fechas de calendario", () => {
  it("no corre el día por la zona horaria", () => {
    expect(formatearFechaCalendario("2026-01-01")).toBe("01-01-2026");
    expect(formatearFechaCalendario("2026-03-31T23:59:59")).toBe("31-03-2026");
  });

  it("usa el mes en palabras en el formato largo", () => {
    expect(formatearFechaCalendarioLarga("2026-09-18")).toMatch(/18 de septiembre de 2026/i);
  });
});
