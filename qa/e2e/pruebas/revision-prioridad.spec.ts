import { expect, test } from "@playwright/test";
import { CASOS, MEDICO, SESION, abrirDetalle } from "../soporte";

test.use({ storageState: SESION.medico });

/** HDU-2 y HDU-7: el médico revisa la prioridad sugerida y deja su motivo. */
test.describe("Revisión de prioridad (HDU-2)", () => {
  test("no permite guardar un cambio sin motivo", async ({ page }) => {
    await abrirDetalle(page, CASOS.palpitaciones);
    const vigente = await page.getByTestId("prioridad-vigente").textContent();
    const otra = vigente === "alta" ? "baja" : "alta";

    await page.getByTestId(`nueva-prioridad-${otra}`).click();
    await page.getByTestId("solicitar-cambio-prioridad").click();

    await expect(page.getByTestId("mensaje-modificacion")).toContainText(
      "Debe ingresar un motivo",
    );
    await expect(page.getByTestId("confirmar-modificacion")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("prioridad-vigente")).toHaveText(vigente ?? "");
  });

  test("guarda el cambio con motivo, lo registra en el historial y marca la revisión", async ({
    page,
  }) => {
    await abrirDetalle(page, CASOS.palpitaciones);
    const vigente = await page.getByTestId("prioridad-vigente").textContent();
    const nueva = vigente === "alta" ? "baja" : "alta";
    const motivo = `Síncope asociado, reevaluado el ${new Date().toISOString()}`;

    await page.getByTestId(`nueva-prioridad-${nueva}`).click();
    await page.getByTestId("motivo-modificacion").fill(motivo);
    await page.getByTestId("solicitar-cambio-prioridad").click();
    await expect(page.getByText(`a nombre de ${MEDICO.nombre}`)).toBeVisible();
    await page.getByTestId("confirmar-modificacion").click();

    await expect(page.getByTestId("mensaje-modificacion")).toContainText("Prioridad modificada");
    await expect(page.getByTestId("prioridad-vigente")).toHaveText(nueva);
    await expect(page.getByText(motivo)).toBeVisible();
    await expect(page.getByTestId("marcar-revisada")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("prioridad-vigente")).toHaveText(nueva);
    await expect(page.getByText(motivo)).toBeVisible();
  });
});
