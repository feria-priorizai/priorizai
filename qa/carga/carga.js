/**
 * Prueba de carga de PriorizAI con k6, contra el ambiente QA.
 *
 * Pasa por el frontend (BASE_URL), igual que un navegador: incluye el proxy de
 * Next.js, que la medición secuencial con TestClient dejaba fuera.
 *
 * Escenarios en paralelo:
 *  - listado: médicos concurrentes recorriendo la lista de espera y el detalle;
 *  - ingesta: cargas de archivos de 100 filas al mismo tiempo que el listado.
 *
 * Los umbrales son los del plan de calidad: si no se cumplen, k6 termina con
 * código distinto de cero y el pipeline falla.
 */
import http from "k6/http";
import { check, fail, group, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3100";
const ADMIN = {
  alias: __ENV.ADMIN_ALIAS || "qa-admin",
  inicial: __ENV.ADMIN_PASSWORD || "qa-admin-inicial-2026",
  definitiva: __ENV.ADMIN_PASSWORD_NUEVA || "qa-admin-definitiva-2026",
};
const VOLUMEN_BASE = Number(__ENV.VOLUMEN_BASE || 1000);
const USUARIOS = Number(__ENV.USUARIOS || 20);
const DURACION = __ENV.DURACION || "1m";

const tiempoListado = new Trend("pz_listado_ms", true);
const tiempoDetalle = new Trend("pz_detalle_ms", true);
const tiempoIngesta = new Trend("pz_ingesta_ms", true);

export const options = {
  scenarios: {
    listado: {
      executor: "ramping-vus",
      exec: "listado",
      startVUs: 1,
      stages: [
        { duration: "15s", target: USUARIOS },
        { duration: DURACION, target: USUARIOS },
        { duration: "5s", target: 0 },
      ],
    },
    ingesta: {
      executor: "constant-arrival-rate",
      exec: "ingesta",
      rate: 6,
      timeUnit: "1m",
      duration: DURACION,
      startTime: "15s",
      preAllocatedVUs: 2,
    },
  },
  thresholds: {
    // Métrica "Tiempo de respuesta del listado (p95)": plan 500 ms.
    pz_listado_ms: ["p(95)<500"],
    pz_detalle_ms: ["p(95)<500"],
    // La ingesta es síncrona (riesgo R9): una carga de 100 filas no debe
    // acercarse al timeout del proxy.
    pz_ingesta_ms: ["p(95)<5000"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

const ESPECIALIDADES = [
  "CARDIOLOGIA",
  "NEUROLOGIA",
  "DERMATOLOGIA",
  "ENDOCRINOLOGIA",
  "MEDICINA INTERNA",
  "TRAUMATOLOGIA",
];
const TEXTOS = [
  ["Dolor lumbar mecanico de larga data", "Lumbago cronico", "Control de especialidad"],
  ["Cefalea intensa de inicio subito", "Cefalea en estudio", "Evaluacion urgente"],
  ["Hipertension arterial en tratamiento", "Hipertension controlada", "Seguimiento"],
  ["Tos persistente hace tres semanas", "Tos en estudio", "Evaluacion por especialista"],
];

/** CSV sintético: nunca datos reales de pacientes. */
function csvSintetico(filas, semilla) {
  const lineas = [
    "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,HISTORIA_CLINICA,FUNDAMENTOS_DIAGNOSTICO,EXAMENES_COMPLEMENTARIOS,MOTIVO_INTERCONSULTA",
  ];
  for (let i = 0; i < filas; i++) {
    const n = semilla + i;
    const [historia, fundamento, motivo] = TEXTOS[n % TEXTOS.length];
    lineas.push(
      [
        "MEDICINA GENERAL",
        18 + (n % 70),
        n % 2 ? "FEMENINO" : "MASCULINO",
        ESPECIALIDADES[n % ESPECIALIDADES.length],
        `${historia} (carga ${n})`,
        fundamento,
        "",
        motivo,
      ].join(","),
    );
  }
  return lineas.join("\n");
}

function cargarCsv(cookie, filas, semilla) {
  return http.post(
    `${BASE_URL}/upload-csv`,
    { file: http.file(csvSintetico(filas, semilla), "carga-k6.csv", "text/csv") },
    { cookies: cookie, timeout: "120s", tags: { endpoint: "upload-csv" } },
  );
}

function iniciarSesion() {
  const intentar = (password) =>
    http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ alias: ADMIN.alias, password }),
      { headers: { "Content-Type": "application/json" }, responseCallback: http.expectedStatuses(200, 401) },
    );

  let respuesta = intentar(ADMIN.inicial);
  if (respuesta.status === 200 && respuesta.json("debe_cambiar_password")) {
    const cambio = http.post(
      `${BASE_URL}/api/auth/cambiar-password`,
      JSON.stringify({ password_actual: ADMIN.inicial, password_nueva: ADMIN.definitiva }),
      { headers: { "Content-Type": "application/json" } },
    );
    if (cambio.status !== 200) fail(`No se pudo cambiar la contraseña: ${cambio.status}`);
    respuesta = cambio;
  } else if (respuesta.status !== 200) {
    respuesta = intentar(ADMIN.definitiva);
  }
  const token = http.cookieJar().cookiesForURL(BASE_URL).priorizai_sesion;
  if (respuesta.status !== 200 || !token) fail(`No se pudo iniciar sesión: ${respuesta.status}`);
  return token[0];
}

/** Sesión de administrador y volumen base de interconsultas. */
export function setup() {
  const token = iniciarSesion();
  const cookie = { priorizai_sesion: token };

  const listado = http.get(`${BASE_URL}/api/interconsultas?limit=1`, { cookies: cookie });
  const existentes = Number(listado.headers["X-Total-Count"] || 0);
  for (let cargadas = existentes; cargadas < VOLUMEN_BASE; cargadas += 250) {
    const respuesta = cargarCsv(cookie, Math.min(250, VOLUMEN_BASE - cargadas), cargadas);
    if (respuesta.status !== 200) fail(`No se pudo cargar el volumen base: ${respuesta.status}`);
  }

  const ids = http
    .get(`${BASE_URL}/api/interconsultas?limit=200`, { cookies: cookie })
    .json()
    .map((ic) => ic.id);
  return { token, ids };
}

export function listado(datos) {
  const cookies = { priorizai_sesion: datos.token };

  group("lista de espera", () => {
    const pagina = Math.floor(Math.random() * 10);
    const respuesta = http.get(
      `${BASE_URL}/api/interconsultas?limit=50&offset=${pagina * 50}`,
      { cookies, tags: { endpoint: "listado" } },
    );
    tiempoListado.add(respuesta.timings.duration);
    check(respuesta, {
      "listado responde 200": (r) => r.status === 200,
      "listado trae interconsultas": (r) => Array.isArray(r.json()),
    });
  });

  group("detalle", () => {
    const id = datos.ids[Math.floor(Math.random() * datos.ids.length)];
    const respuesta = http.get(`${BASE_URL}/api/interconsultas/${id}`, {
      cookies,
      tags: { endpoint: "detalle" },
    });
    tiempoDetalle.add(respuesta.timings.duration);
    check(respuesta, { "detalle responde 200": (r) => r.status === 200 });
  });

  // Tiempo de lectura de un médico entre una acción y otra.
  sleep(1 + Math.random());
}

export function ingesta(datos) {
  const respuesta = cargarCsv({ priorizai_sesion: datos.token }, 100, Date.now() % 100000);
  tiempoIngesta.add(respuesta.timings.duration);
  check(respuesta, {
    "ingesta responde 200": (r) => r.status === 200,
    "ingesta guarda las 100 filas": (r) => r.status === 200 && r.json("inserted") === 100,
  });
}

export function handleSummary(resumen) {
  const p95 = (metrica) => resumen.metrics[metrica]?.values["p(95)"]?.toFixed(1) ?? "-";
  const texto = [
    "Resumen de la prueba de carga",
    `  Usuarios concurrentes (listado): ${USUARIOS}`,
    `  Listado  p95: ${p95("pz_listado_ms")} ms (plan <= 500 ms)`,
    `  Detalle  p95: ${p95("pz_detalle_ms")} ms (plan <= 500 ms)`,
    `  Ingesta  p95: ${p95("pz_ingesta_ms")} ms por archivo de 100 filas (plan <= 5000 ms)`,
    `  Peticiones fallidas: ${(resumen.metrics.http_req_failed.values.rate * 100).toFixed(2)} %`,
    "",
  ].join("\n");
  return {
    stdout: texto,
    "/scripts/resultados/resumen.json": JSON.stringify(resumen, null, 2),
  };
}
