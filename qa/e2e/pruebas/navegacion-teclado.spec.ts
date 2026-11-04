import { expect, test, type Locator, type Page } from "@playwright/test";
import { CASOS, SESION, abrirDetalle } from "../soporte";

test.use({ storageState: SESION.medico });

/** Avanza con Tab hasta que el foco llega al elemento; falla si no llega. */
async function tabularHasta(page: Page, destino: Locator, maximo = 15): Promise<void> {
  for (let i = 0; i < maximo; i++) {
    if (await destino.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(destino).toBeFocused();
}

/** HDU-20: la aplicación se recorre y se opera solo con el teclado. */
test.describe("Navegación por teclado (HDU-20)", () => {
  test("el primer Tab ofrece saltar el menú y lleva al contenido", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("usuario-nombre")).toBeVisible();

    await page.keyboard.press("Tab");
    const saltar = page.getByTestId("saltar-contenido");
    await expect(saltar).toBeFocused();
    await expect(saltar).toBeInViewport();

    await page.keyboard.press("Enter");
    await expect(page.locator("#contenido")).toBeFocused();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("las flechas recorren la lista de espera y Enter abre el detalle", async ({ page }) => {
    await page.goto("/interconsultas");
    const filas = page.getByTestId("fila-interconsulta");
    await expect(filas.nth(2)).toBeVisible();
    const folio = (fila: Locator) => fila.locator("[data-folio]");

    await folio(filas.first()).focus();
    await page.keyboard.press("ArrowDown");
    await expect(folio(filas.nth(1))).toBeFocused();
    await page.keyboard.press("End");
    await expect(folio(filas.last())).toBeFocused();
    await page.keyboard.press("Home");
    await expect(folio(filas.first())).toBeFocused();

    await page.keyboard.press("ArrowDown");
    const destino = await folio(filas.nth(1)).getAttribute("href");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`${destino}$`));
    await expect(page.getByTestId("prioridad-vigente")).toBeVisible();
  });

  test("el resumen de carga atrapa el foco y Esc lo devuelve al botón de carga", async ({
    page,
  }) => {
    await page.goto("/interconsultas");
    const cargar = page.getByTestId("cargar-archivo");
    await cargar.focus();

    await page.getByTestId("input-archivo").setInputFiles({
      name: "columnas-incorrectas.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("NOMBRE,APELLIDO\nAna,Soto\n", "utf-8"),
    });

    const dialogo = page.getByTestId("resultado-carga");
    await expect(dialogo).toBeVisible();
    const cerrar = dialogo.getByRole("button", { name: "Cerrar" });
    await expect(cerrar).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("cerrar-resultado-carga")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cerrar).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByTestId("cerrar-resultado-carga")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
    await expect(cargar).toBeFocused();
  });

  test("cambia la prioridad con su motivo y la guarda sin usar el mouse", async ({ page }) => {
    await abrirDetalle(page, CASOS.palpitaciones);
    const vigente = await page.getByTestId("prioridad-vigente").textContent();
    const nueva = vigente === "alta" ? "baja" : "alta";
    const motivo = `Reevaluado solo con teclado el ${new Date().toISOString()}`;

    const opcion = page.getByTestId(`nueva-prioridad-${nueva}`);
    await page.getByTestId("saltar-contenido").focus();
    await page.keyboard.press("Enter");
    await tabularHasta(page, opcion, 60);
    await page.keyboard.press("Space");
    await expect(opcion).toHaveAttribute("aria-pressed", "true");

    await tabularHasta(page, page.getByTestId("motivo-modificacion"));
    await page.keyboard.type(motivo);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("solicitar-cambio-prioridad")).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("confirmar-modificacion")).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("mensaje-modificacion")).toContainText("Prioridad modificada");
    await expect(page.getByTestId("mensaje-modificacion")).toBeFocused();
    await expect(page.getByTestId("prioridad-vigente")).toHaveText(nueva);
    await expect(page.getByText(motivo)).toBeVisible();
  });
});
