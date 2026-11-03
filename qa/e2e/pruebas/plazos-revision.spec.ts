import { expect, test } from "@playwright/test";
import { CASOS, SESION, abrirDetalle, fila } from "../soporte";

/**
 * HDU-22: plazos de revisión por prioridad e interconsultas atrasadas.
 *
 * Los datos de datos/interconsultas_qa.csv se emitieron en septiembre de 2026,
 * así que con los plazos de fábrica (alta 5, media 15, baja 30) toda pendiente
 * ya está atrasada. La prueba del administrador guarda esos mismos plazos para
 * no cambiarle el escenario al resto de las pruebas.
 */
test.describe("Plazos de revisión (HDU-22)", () => {
  test.describe("administrador", () => {
    test.use({ storageState: SESION.admin });

    test("valida y guarda los plazos desde la configuración", async ({ page }) => {
      await page.goto("/configuracion");
      const alta = page.getByTestId("plazo-alta");
      const media = page.getByTestId("plazo-media");
      const baja = page.getByTestId("plazo-baja");
      await expect(alta).not.toHaveValue("");

      await media.fill("0");
      await expect(page.getByTestId("plazo-media-error")).toHaveText(
        "Valor inválido: el plazo debe ser mayor que 0 días.",
      );
      await expect(media).toHaveAttribute("aria-invalid", "true");

      await alta.fill("20");
      await media.fill("15");
      await page.getByTestId("guardar-plazos").click();
      await expect(page.getByTestId("mensaje-plazos")).toContainText(
        "El plazo de prioridad alta no puede ser mayor que el de prioridad media",
      );
      await expect(alta).toBeFocused();

      await alta.fill("5");
      await baja.fill("30");
      await page.getByTestId("guardar-plazos").click();
      await expect(page.getByTestId("mensaje-plazos")).toContainText("Plazos guardados");

      await page.reload();
      await expect(alta).toHaveValue("5");
      await expect(media).toHaveValue("15");
      await expect(baja).toHaveValue("30");
    });
  });

  test.describe("médica de Cardiología", () => {
    test.use({ storageState: SESION.medico });

    test("no puede cambiar los plazos por la API", async ({ page }) => {
      const respuesta = await page.request.put("/api/plazos-revision", {
        data: { alta: 1, media: 1, baja: 1 },
      });
      expect(respuesta.status()).toBe(403);
    });

    test("filtra las atrasadas de mayor a menor atraso", async ({ page }) => {
      await page.goto("/interconsultas");
      await expect(fila(page, CASOS.sinDolorToracico).getByTestId("atrasada")).toBeVisible();

      await page.locator("#filtro-estado").selectOption("atrasada");

      await expect(page.getByRole("heading", { name: "Atrasadas" })).toBeVisible();
      await expect(fila(page, CASOS.sinDolorToracico)).toBeVisible();
      const filas = page.getByTestId("fila-interconsulta");
      const total = await filas.count();
      await expect(filas.getByTestId("atrasada")).toHaveCount(total);

      const dias = (await filas.getByTestId("atrasada").allTextContents()).map((texto) =>
        Number(texto.match(/\+(\d+) d/)?.[1]),
      );
      expect(dias).toEqual([...dias].sort((a, b) => b - a));
    });

    test("al revisarla deja de estar atrasada", async ({ page }) => {
      await abrirDetalle(page, CASOS.sinDolorToracico);
      await expect(page.getByTestId("atrasada")).toBeVisible();

      await page.getByTestId("marcar-revisada").click();
      await expect(page.getByTestId("marcar-revisada")).toHaveCount(0);
      await expect(page.getByTestId("atrasada")).toHaveCount(0);

      await page.goto("/interconsultas");
      await expect(fila(page, CASOS.sinDolorToracico)).toBeVisible();
      await expect(fila(page, CASOS.sinDolorToracico).getByTestId("atrasada")).toHaveCount(0);
    });
  });
});
