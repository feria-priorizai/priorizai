import { expect, test } from "@playwright/test";
import { ADMIN, MEDICO, SESION, aliasUnico, iniciarSesionUi } from "../soporte";

/** HDU-15: inicio de sesión. Empiezan sin sesión. */
test.describe("Login (HDU-15)", () => {
  test("CA-01: credenciales válidas autentican y llevan al dashboard", async ({ page }) => {
    await page.goto("/login");

    await iniciarSesionUi(page, MEDICO.alias, MEDICO.password);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("usuario-nombre")).toHaveText(MEDICO.nombre);
  });

  test("CA-02: credenciales inválidas informan el error y no abren sesión", async ({ page }) => {
    await page.goto("/login");

    await iniciarSesionUi(page, MEDICO.alias, "contrasena-equivocada");

    await expect(page.getByTestId("login-error")).toContainText("alias o contraseña incorrectos");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId("login-password")).toHaveValue("");
  });

  test("CA-03: sin sesión se pide autenticación y luego se vuelve a la página pedida", async ({
    page,
  }) => {
    await page.goto("/interconsultas");

    await expect(page).toHaveURL(/\/login\?next=%2Finterconsultas$/);
    await iniciarSesionUi(page, MEDICO.alias, MEDICO.password);
    await expect(page).toHaveURL(/\/interconsultas$/);
  });

  test("el alias se bloquea tras 5 intentos fallidos seguidos", async ({ page }) => {
    // Alias inventado: el bloqueo se lleva por alias, exista o no, y así no
    // se bloquea una cuenta que usan las demás pruebas.
    const alias = aliasUnico("qa-bloqueo");
    await page.goto("/login");

    for (let intento = 1; intento <= 5; intento++) {
      await iniciarSesionUi(page, alias, `intento-fallido-${intento}`);
      await expect(page.getByTestId("login-error")).toContainText("incorrectos");
    }
    await iniciarSesionUi(page, alias, "intento-fallido-6");

    await expect(page.getByTestId("login-error")).toContainText("Demasiados intentos fallidos");
  });

  test("el primer ingreso obliga a cambiar la contraseña asignada", async ({ page, browser }) => {
    const alias = aliasUnico("qa-nuevo");
    const admin = await browser.newContext({ storageState: SESION.admin });
    const creacion = await admin.request.post("/api/usuarios", {
      data: {
        alias,
        nombre: "Médico Nuevo",
        correo: `${alias}@priorizai.test`,
        rol: "medico",
        especialidad: "Neurología",
        password: "asignada-por-admin",
      },
    });
    expect(creacion.status()).toBe(201);
    await admin.close();

    await page.goto("/login");
    await iniciarSesionUi(page, alias, "asignada-por-admin");
    await expect(page.getByRole("heading", { name: "Crea tu contraseña" })).toBeVisible();

    await page.getByTestId("password-actual").fill("asignada-por-admin");
    await page.getByTestId("password-nueva").fill("elegida-por-mi-2026");
    await page.getByTestId("password-confirmacion").fill("elegida-por-mi-2026");
    await page.getByTestId("cambio-password-submit").click();

    await expect(page.getByTestId("usuario-nombre")).toHaveText("Médico Nuevo");
  });

  test("cerrar sesión invalida la sesión en el servidor", async ({ page }) => {
    await page.goto("/login");
    await iniciarSesionUi(page, ADMIN.alias, ADMIN.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByTestId("cerrar-sesion").click();

    await expect(page).toHaveURL(/\/login$/);
    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(401);
  });
});
