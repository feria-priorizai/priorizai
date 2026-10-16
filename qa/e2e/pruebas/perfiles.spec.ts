import { expect, test } from "@playwright/test";
import { CASOS, SESION, fila } from "../soporte";

/** HDU-5 y HDU-16: qué ve y qué puede hacer cada perfil. */
test.describe("Perfiles (HDU-5, HDU-16)", () => {
  test.describe("médica de Cardiología", () => {
    test.use({ storageState: SESION.medico });

    test("solo ve las interconsultas de su especialidad", async ({ page }) => {
      await page.goto("/interconsultas");

      await expect(fila(page, CASOS.dolorToracico)).toBeVisible();
      await expect(fila(page, CASOS.sinDolorToracico)).toBeVisible();
      await expect(fila(page, CASOS.convulsiones)).toHaveCount(0);
      await expect(fila(page, CASOS.diabetes)).toHaveCount(0);
    });

    test("no accede a la administración de cuentas ni a la configuración", async ({ page }) => {
      await page.goto("/dashboard");
      const menu = page.getByRole("navigation");
      await expect(menu.getByRole("link", { name: "Interconsultas" })).toBeVisible();
      await expect(menu.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
      await expect(menu.getByRole("link", { name: "Configuración" })).toHaveCount(0);

      await page.goto("/configuracion");
      await expect(page).toHaveURL(/\/dashboard$/);

      const cuentas = await page.request.get("/api/usuarios");
      expect(cuentas.status()).toBe(403);
    });
  });

  test.describe("administrador", () => {
    test.use({ storageState: SESION.admin });

    test("ve todas las especialidades y la gestión de cuentas", async ({ page }) => {
      await page.goto("/interconsultas");
      await expect(fila(page, CASOS.convulsiones)).toBeVisible();
      await expect(fila(page, CASOS.diabetes)).toBeVisible();

      await page.getByRole("navigation").getByRole("link", { name: "Usuarios" }).click();
      await expect(page).toHaveURL(/\/usuarios$/);
      await expect(page.getByText("qa-cardiologa", { exact: true })).toBeVisible();
    });
  });
});
