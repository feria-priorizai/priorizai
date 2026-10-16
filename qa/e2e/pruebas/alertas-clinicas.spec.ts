import { expect, test } from "@playwright/test";
import { CASOS, SESION, abrirDetalle, fila } from "../soporte";

test.use({ storageState: SESION.admin });

/** HDU-14: banderas rojas sobre las interconsultas de qa/e2e/datos. */
test.describe("Alertas clínicas (HDU-14)", () => {
  test("CA-01: un signo de alarma afirmado marca la alerta y fuerza prioridad alta", async ({
    page,
  }) => {
    await page.goto("/interconsultas");

    for (const caso of [CASOS.dolorToracico, CASOS.convulsiones]) {
      const conAlerta = fila(page, caso);
      await expect(conAlerta.getByTestId("bandera-roja")).toBeVisible();
      await expect(conAlerta).toContainText("regla clínica");
    }
  });

  test("CA-02: un término negado o histórico no dispara la alerta", async ({ page }) => {
    await page.goto("/interconsultas");

    await expect(fila(page, CASOS.sinDolorToracico)).toBeVisible();
    await expect(fila(page, CASOS.sinDolorToracico).getByTestId("bandera-roja")).toHaveCount(0);
    await expect(fila(page, CASOS.sepsisHistorica).getByTestId("bandera-roja")).toHaveCount(0);
  });

  test("CA-03: reevaluar las alertas no pisa la decisión del médico", async ({ page }) => {
    await abrirDetalle(page, CASOS.convulsiones);
    await expect(page.getByTestId("prioridad-vigente")).toHaveText("alta");

    await page.getByTestId("nueva-prioridad-media").click();
    await page.getByTestId("motivo-modificacion").fill("Crisis única ya evaluada en urgencia");
    await page.getByTestId("solicitar-cambio-prioridad").click();
    await page.getByTestId("confirmar-modificacion").click();
    await expect(page.getByTestId("prioridad-vigente")).toHaveText("media");

    await page.getByRole("button", { name: "Reevaluar banderas" }).click();
    await expect(page.getByRole("status").filter({ hasText: /reevalu/i })).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("prioridad-vigente")).toHaveText("media");
  });
});
