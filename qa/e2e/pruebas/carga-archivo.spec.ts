import { expect, test } from "@playwright/test";
import { SESION } from "../soporte";

test.use({ storageState: SESION.medico });

/** HDU-13: importación de interconsultas desde el menú lateral. */
test.describe("Carga de archivo (HDU-13)", () => {
  test("guarda las filas válidas, prioriza y detalla las filas rechazadas", async ({ page }) => {
    const marca = `Carga E2E ${Date.now()}`;
    const csv = [
      "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,HISTORIA_CLINICA,FUNDAMENTOS_DIAGNOSTICO,EXAMENES_COMPLEMENTARIOS,MOTIVO_INTERCONSULTA",
      `MEDICINA GENERAL,52,FEMENINO,CARDIOLOGIA,${marca} soplo en control,Soplo sistolico,,Control de especialidad`,
      `MEDICINA GENERAL,45,MASCULINO,CARDIOLOGIA,${marca} disnea de esfuerzo,Insuficiencia cardiaca en estudio,,Evaluacion`,
      `MEDICINA GENERAL,,MASCULINO,CARDIOLOGIA,${marca} sin edad,Dato incompleto,,Evaluacion`,
    ].join("\n");
    await page.goto("/interconsultas");

    await page.getByTestId("input-archivo").setInputFiles({
      name: "carga-e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    const resultado = page.getByTestId("resultado-carga");
    await expect(resultado).toBeVisible();
    await expect(resultado).toContainText("Carga parcial");
    await expect(resultado).toContainText("Se cargaron 2 de 3 interconsultas");
    await expect(resultado).toContainText("Fila 4");
    await expect(resultado).toContainText("EDAD");

    await page.getByTestId("cerrar-resultado-carga").click();
    await expect(resultado).toBeHidden();
    await expect(page.getByTestId("fila-interconsulta").filter({ hasText: marca })).toHaveCount(2);
  });

  test("rechaza un archivo sin las columnas obligatorias", async ({ page }) => {
    await page.goto("/interconsultas");

    await page.getByTestId("input-archivo").setInputFiles({
      name: "columnas-incorrectas.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("NOMBRE,APELLIDO\nAna,Soto\n", "utf-8"),
    });

    const resultado = page.getByTestId("resultado-carga");
    await expect(resultado).toBeVisible();
    await expect(resultado).toContainText("Carga fallida");
  });
});
