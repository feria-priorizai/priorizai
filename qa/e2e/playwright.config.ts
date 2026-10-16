import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas end-to-end sobre los flujos críticos de PriorizAI.
 *
 * Corren contra el ambiente QA (docker-compose.qa.yml). BASE_URL apunta al
 * frontend: dentro de la red de Docker es http://frontend:3000 y desde el
 * equipo, http://localhost:3100.
 */
export default defineConfig({
  testDir: "./pruebas",
  globalSetup: "./preparacion.ts",
  // Las pruebas comparten la base del ambiente QA: en serie el resultado no
  // depende del orden en que termine cada una.
  fullyParallel: false,
  workers: 1,
  // Un reintento en CI separa una falla real de una inestable (riesgo R2):
  // si pasa al reintentar, el reporte la marca como "flaky".
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: "reportes/artefactos",
  reporter: [
    ["list"],
    ["html", { outputFolder: "reportes/html", open: "never" }],
    ["junit", { outputFile: "reportes/junit.xml" }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    locale: "es-CL",
    timezoneId: "America/Santiago",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
