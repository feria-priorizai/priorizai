import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Pruebas unitarias y de componentes del frontend (plan de calidad, OE1).
 * La cobertura se mide sobre la lógica que no depende del router de Next:
 * utilidades, servicios de la API y componentes de formulario.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    unstubGlobals: true,
    reporters: ["default", "junit"],
    outputFile: { junit: "coverage/junit.xml" },
    coverage: {
      provider: "v8",
      reporter: ["text", "cobertura", "html"],
      reportsDirectory: "coverage",
      include: [
        "utils/**/*.ts",
        "services/**/*.ts",
        "components/ui/**/*.tsx",
        "components/auth/FormularioCambioPassword.tsx",
        "components/interconsultas/FormularioModificarPrioridad.tsx",
      ],
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
