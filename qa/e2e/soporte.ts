import path from "node:path";
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/** Cuentas del ambiente QA. El admin lo crea el backend desde el entorno. */
export const ADMIN = {
  alias: process.env.ADMIN_ALIAS ?? "qa-admin",
  passwordInicial: process.env.ADMIN_PASSWORD ?? "qa-admin-inicial-2026",
  password: process.env.ADMIN_PASSWORD_NUEVA ?? "qa-admin-definitiva-2026",
};

export const MEDICO = {
  alias: "qa-cardiologa",
  nombre: "Dra. Carla Rojas",
  correo: "qa-cardiologa@priorizai.test",
  especialidad: "Cardiología",
  passwordTemporal: "qa-medico-temporal-2026",
  password: "qa-medico-definitiva-2026",
};

export const SESION = {
  admin: path.join(__dirname, ".auth", "admin.json"),
  medico: path.join(__dirname, ".auth", "medico.json"),
};

export const DATOS = path.join(__dirname, "datos", "interconsultas_qa.csv");

/**
 * Cada corrida carga su propia copia de datos/interconsultas_qa.csv con este
 * identificador al final de la historia clínica. Así las pruebas se pueden
 * repetir sobre la misma base sin heredar los cambios de la corrida anterior.
 * Lo fija preparacion.ts; Playwright pasa a los workers las variables de
 * entorno que define el globalSetup.
 */
export function marcaDeCorrida(): string {
  const corrida = process.env.PZ_CORRIDA;
  if (!corrida) throw new Error("Falta PZ_CORRIDA: la define preparacion.ts");
  return `[corrida ${corrida}]`;
}

const HISTORIAS = {
  dolorToracico: "Paciente con dolor toracico opresivo de inicio subito",
  sinDolorToracico: "Paciente sin dolor toracico ni disnea",
  palpitaciones: "Palpitaciones ocasionales al esfuerzo",
  convulsiones: "Episodio de convulsiones tonico clonicas ayer",
  nevus: "Lesion pigmentada en dorso sin cambios",
  diabetes: "Diabetes tipo 2 en tratamiento con metformina",
  sepsisHistorica: "Antecedente de sepsis resuelta en 2019",
};

/** Historia clínica de cada caso de datos/interconsultas_qa.csv en esta corrida. */
export const CASOS = new Proxy(HISTORIAS, {
  get: (historias, caso: keyof typeof HISTORIAS) => `${historias[caso]} ${marcaDeCorrida()}`,
});

/**
 * Inicia sesión por la API y, si es el primer ingreso, cambia la contraseña
 * inicial por la definitiva. Prueba primero la inicial: en un ambiente QA
 * recién levantado es la que sirve y así no suma intentos fallidos.
 */
export async function iniciarSesionApi(
  request: APIRequestContext,
  alias: string,
  passwordInicial: string,
  passwordDefinitiva: string,
): Promise<void> {
  const conInicial = await request.post("/api/auth/login", {
    data: { alias, password: passwordInicial },
  });
  if (conInicial.ok()) {
    const usuario = await conInicial.json();
    if (usuario.debe_cambiar_password) {
      const cambio = await request.post("/api/auth/cambiar-password", {
        data: { password_actual: passwordInicial, password_nueva: passwordDefinitiva },
      });
      expect(cambio.ok(), await cambio.text()).toBeTruthy();
    }
    return;
  }
  const conDefinitiva = await request.post("/api/auth/login", {
    data: { alias, password: passwordDefinitiva },
  });
  expect(conDefinitiva.ok(), await conDefinitiva.text()).toBeTruthy();
}

/** Login por la interfaz, como lo hace una persona. */
export async function iniciarSesionUi(page: Page, alias: string, password: string) {
  await page.getByTestId("login-alias").fill(alias);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

/** Fila de la lista de espera que contiene el texto indicado. */
export function fila(page: Page, texto: string): Locator {
  return page.getByTestId("fila-interconsulta").filter({ hasText: texto }).first();
}

/** Abre el detalle de la interconsulta desde la lista de espera. */
export async function abrirDetalle(page: Page, texto: string): Promise<void> {
  await page.goto("/interconsultas");
  await fila(page, texto).click();
  await expect(page).toHaveURL(/\/interconsultas\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("prioridad-vigente")).toBeVisible();
}

/** Alias único por ejecución, para cuentas que la prueba consume. */
export function aliasUnico(prefijo: string): string {
  return `${prefijo}-${Date.now().toString(36)}`;
}
