import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import { CASOS, SESION, abrirDetalle, fila } from "../soporte";

test.use({ storageState: SESION.admin });

/** HDU-13: exportación. Se genera en el navegador, así que solo se prueba aquí. */
test.describe("Exportación (HDU-13)", () => {
  test("exporta una interconsulta revisada a CSV", async ({ page }) => {
    await abrirDetalle(page, CASOS.nevus);
    await expect(page.getByTestId("exportar")).toBeDisabled();

    await page.getByTestId("marcar-revisada").click();
    await expect(page.getByTestId("exportar")).toBeEnabled();
    await page.getByTestId("formato-exportacion").selectOption("csv");
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("exportar").click(),
    ]);

    expect(descarga.suggestedFilename()).toMatch(/^interconsulta-[0-9a-f-]{36}\.csv$/);
    const contenido = await readFile(await descarga.path(), "utf-8");
    const [encabezados, valores] = contenido.replace(/^﻿/, "").trim().split("\r\n");
    expect(encabezados).toContain('"Especialidad Destino"');
    expect(encabezados).toContain('"Estado"');
    expect(valores).toContain('"DERMATOLOGIA"');
    expect(valores).toContain('"revisada"');
  });

  test("descarga varias interconsultas revisadas en un XLSX", async ({ page }) => {
    await abrirDetalle(page, CASOS.diabetes);
    if (await page.getByTestId("marcar-revisada").isVisible()) {
      await page.getByTestId("marcar-revisada").click();
      await expect(page.getByTestId("marcar-revisada")).toHaveCount(0);
    }
    await page.goto("/interconsultas");

    await page.getByTestId("descarga-multiple").click();
    // En modo descarga solo se listan las revisadas.
    await expect(fila(page, CASOS.diabetes)).toBeVisible();
    await expect(fila(page, CASOS.sepsisHistorica)).toHaveCount(0);
    await page.getByTestId("seleccionar-todas").check();
    await page.getByTestId("formato-descarga").selectOption("xlsx");
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("descargar-seleccion").click(),
    ]);

    expect(descarga.suggestedFilename()).toMatch(/^interconsultas-ic-\d{8}-\d{6}\.xlsx$/);
    const libro = XLSX.read(await readFile(await descarga.path()));
    const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      libro.Sheets.Interconsultas,
    );
    expect(filas.length).toBeGreaterThanOrEqual(1);
    expect(filas.every((f) => f.Estado === "revisada")).toBe(true);
    expect(filas.some((f) => f["Especialidad Destino"] === "ENDOCRINOLOGIA")).toBe(true);
  });
});
