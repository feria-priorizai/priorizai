import { readFileSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";
import { ADMIN, DATOS, MEDICO, SESION, iniciarSesionApi, marcaDeCorrida } from "./soporte";

/**
 * Deja el ambiente QA listo antes de las pruebas:
 *  1. el administrador inicial con su contraseña definitiva;
 *  2. una médica de Cardiología, creada por el administrador;
 *  3. una copia de las interconsultas sintéticas de datos/, marcada con el
 *     identificador de esta corrida.
 *
 * Guarda la sesión de cada cuenta para que las pruebas que no son de login
 * empiecen ya autenticadas.
 */
export default async function preparar(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0].use.baseURL;
  process.env.PZ_CORRIDA = Date.now().toString(36);

  const admin = await request.newContext({ baseURL });
  await iniciarSesionApi(admin, ADMIN.alias, ADMIN.passwordInicial, ADMIN.password);

  const creacion = await admin.post("/api/usuarios", {
    data: {
      alias: MEDICO.alias,
      nombre: MEDICO.nombre,
      correo: MEDICO.correo,
      rol: "medico",
      especialidad: MEDICO.especialidad,
      password: MEDICO.passwordTemporal,
    },
  });
  if (!creacion.ok() && creacion.status() !== 409) {
    throw new Error(`No se pudo crear la cuenta médica: ${await creacion.text()}`);
  }

  const carga = await admin.post("/upload-csv", {
    multipart: {
      file: {
        name: "interconsultas_qa.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(marcarHistorias(readFileSync(DATOS, "utf-8")), "utf-8"),
      },
    },
  });
  if (!carga.ok()) {
    throw new Error(`No se pudieron cargar los datos de prueba: ${await carga.text()}`);
  }

  await admin.storageState({ path: SESION.admin });
  await admin.dispose();

  const medico = await request.newContext({ baseURL });
  await iniciarSesionApi(medico, MEDICO.alias, MEDICO.passwordTemporal, MEDICO.password);
  await medico.storageState({ path: SESION.medico });
  await medico.dispose();
}

/** Agrega la marca de la corrida a la HISTORIA_CLINICA de cada fila. */
function marcarHistorias(csv: string): string {
  const [encabezado, ...filas] = csv.trim().split(/\r?\n/);
  const columna = encabezado.split(",").indexOf("HISTORIA_CLINICA");
  const marcadas = filas.map((fila) => {
    const celdas = fila.split(",");
    celdas[columna] = `${celdas[columna]} ${marcaDeCorrida()}`;
    return celdas.join(",");
  });
  return [encabezado, ...marcadas].join("\n") + "\n";
}
