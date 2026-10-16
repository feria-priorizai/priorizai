import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import type { ConfiguracionCampos } from "@/types/campos";
import { DEFAULT_CONFIG } from "@/types/campos";
import {
  exportarInterconsulta,
  exportarInterconsultas,
  generarDatosCSV,
  prepararDatosParaExport,
} from "@/utils/exportUtils";
import { crearInterconsulta } from "./fabricas";

const config: ConfiguracionCampos = {
  ...DEFAULT_CONFIG,
  camposExport: [
    "ID",
    "EDAD",
    "PRIORIDAD_ACTUAL",
    "MOTIVO_INTERCONSULTA",
    "PROB_ALTA",
    "CAMPO_LIBRE",
  ],
};

interface Descarga {
  nombre: string;
  blob: Blob;
}

let descargas: Descarga[];

// jsdom no descarga archivos: se intercepta el enlace temporal que arma
// descargarArchivo() y se guarda el Blob para inspeccionarlo.
beforeEach(() => {
  descargas = [];
  const blobs = new Map<string, Blob>();
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:prueba/${blobs.size}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    descargas.push({ nombre: this.download, blob: blobs.get(this.href)! });
  });
});

async function textoDe(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

async function filasXlsx(blob: Blob): Promise<unknown[][]> {
  const libro = XLSX.read(await blob.arrayBuffer(), { type: "array" });
  return XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets.Interconsultas, { header: 1 });
}

describe("prepararDatosParaExport", () => {
  it("exporta solo los campos configurados, en su orden", () => {
    const ic = crearInterconsulta({ id: "ic-1", prioridadActual: "alta" });
    const datos = prepararDatosParaExport(ic, config);
    expect(Object.keys(datos)).toEqual(config.camposExport);
    expect(datos.ID).toBe("ic-1");
    expect(datos.PRIORIDAD_ACTUAL).toBe("alta");
    expect(datos.PROB_ALTA).toBe(0.18);
  });

  it("toma la propiedad homónima cuando el campo no tiene un mapeo", () => {
    const ic = { ...crearInterconsulta(), CAMPO_LIBRE: "valor" };
    expect(prepararDatosParaExport(ic, config).CAMPO_LIBRE).toBe("valor");
  });

  it("sabe exportar cada campo que ofrece la configuración", () => {
    const ic = crearInterconsulta({
      id: "ic-9",
      prioridadOriginalCsv: "Alta",
      examenesComplementarios: "ECG normal",
    });
    const campos = [
      "ID", "PACIENTE_ID", "PACIENTE_EDAD", "ESPECIALIDAD", "CENTRO_ORIGEN",
      "DIAGNOSTICO", "MOTIVO_INTERCONSULTA", "ES_VALIDA_PARA_PRIORIZACION",
      "ESTADO", "PRIORIDAD_ACTUAL", "FECHA_INGRESO", "FECHA_ACTUALIZACION",
      "NIVEL_SUGERIDO_IA", "CONFIANZA_IA", "PROB_BAJA", "PROB_MEDIA", "PROB_ALTA",
      "JUSTIFICACION_IA", "PRIORIZADA_IA", "EDAD", "SEXO", "ESPEC_ORIGEN",
      "ESPEC_DESTINO", "HISTORIA_CLINICA", "FUNDAMENTOS_DIAGNOSTICO",
      "EXAMENES_COMPLEMENTARIOS", "PRIORIDAD_ORIGINAL_CSV",
    ];

    const datos = prepararDatosParaExport(ic, { ...config, camposExport: campos });

    expect(datos).toEqual({
      ID: "ic-9",
      PACIENTE_ID: ic.pacienteId,
      PACIENTE_EDAD: 54,
      ESPECIALIDAD: "Cardiología",
      CENTRO_ORIGEN: "Medicina General",
      DIAGNOSTICO: "Dolor torácico opresivo",
      MOTIVO_INTERCONSULTA: "Evaluación cardiológica",
      ES_VALIDA_PARA_PRIORIZACION: "true",
      ESTADO: "pendiente",
      PRIORIDAD_ACTUAL: "media",
      FECHA_INGRESO: ic.fechaIngreso,
      FECHA_ACTUALIZACION: ic.fechaActualizacion,
      NIVEL_SUGERIDO_IA: "media",
      CONFIANZA_IA: 72,
      PROB_BAJA: 0.1,
      PROB_MEDIA: 0.72,
      PROB_ALTA: 0.18,
      JUSTIFICACION_IA: "Sugerida por el modelo",
      PRIORIZADA_IA: "true",
      EDAD: 54,
      SEXO: "Masculino",
      ESPEC_ORIGEN: "Medicina General",
      ESPEC_DESTINO: "Cardiología",
      HISTORIA_CLINICA: "Dolor torácico opresivo",
      FUNDAMENTOS_DIAGNOSTICO: "Sospecha de angina",
      EXAMENES_COMPLEMENTARIOS: "ECG normal",
      PRIORIDAD_ORIGINAL_CSV: "Alta",
    });
  });

  it("deja vacíos los campos opcionales nulos", () => {
    const datos = prepararDatosParaExport(crearInterconsulta(), {
      ...config,
      camposExport: ["EXAMENES_COMPLEMENTARIOS", "PRIORIDAD_ORIGINAL_CSV", "PRIORIZADA_IA"],
    });
    expect(datos).toEqual({
      EXAMENES_COMPLEMENTARIOS: undefined,
      PRIORIDAD_ORIGINAL_CSV: undefined,
      PRIORIZADA_IA: "true",
    });
    const sinIA = crearInterconsulta({
      priorizacionIA: { nivelSugerido: "baja", confianza: 0, justificacion: "" },
    });
    expect(prepararDatosParaExport(sinIA, { ...config, camposExport: ["PRIORIZADA_IA"] }))
      .toEqual({ PRIORIZADA_IA: undefined });
  });

  it("exporta los booleanos como texto y deja vacíos los que no vienen", () => {
    const ic = crearInterconsulta({ esValidaParaPriorizacion: undefined });
    const datos = prepararDatosParaExport(ic, {
      ...config,
      camposExport: ["ES_VALIDA_PARA_PRIORIZACION", "PRIORIZADA_IA"],
    });
    expect(datos).toEqual({ ES_VALIDA_PARA_PRIORIZACION: undefined, PRIORIZADA_IA: "true" });
  });
});

describe("generarDatosCSV", () => {
  it("usa la etiqueta legible como encabezado y texto vacío para lo que falta", () => {
    const ic = crearInterconsulta({ id: "ic-2", edad: undefined, pacienteEdad: 61 });
    const { headers, fila } = generarDatosCSV(ic, config);
    expect(headers.slice(0, 3)).toEqual(["ID", "Edad", "Prioridad Actual"]);
    expect(headers[5]).toBe("CAMPO_LIBRE");
    expect(fila.slice(0, 3)).toEqual(["ic-2", "61", "media"]);
    expect(fila[5]).toBe("");
  });
});

describe("exportación de una interconsulta", () => {
  it("descarga un JSON con formato versionado", async () => {
    exportarInterconsulta(crearInterconsulta({ id: "ic-3" }), "json", config);
    expect(descargas).toHaveLength(1);
    expect(descargas[0].nombre).toBe("interconsulta-ic-3.json");
    const json = JSON.parse(await textoDe(descargas[0].blob));
    expect(json.formato).toBe("priorizai.interconsulta.v1");
    expect(json.interconsulta.ID).toBe("ic-3");
  });

  it("descarga un CSV con BOM, CRLF y comillas escapadas", async () => {
    const ic = crearInterconsulta({ id: "ic-4", motivoInterconsulta: 'dolor "intenso"' });
    exportarInterconsulta(ic, "csv", config);
    const texto = await textoDe(descargas[0].blob);
    expect(descargas[0].nombre).toBe("interconsulta-ic-4.csv");
    expect(texto.startsWith("﻿")).toBe(true);
    expect(texto).toContain("\r\n");
    expect(texto).toContain('"dolor ""intenso"""');
  });

  it("neutraliza celdas que una planilla ejecutaría como fórmula", async () => {
    const ic = crearInterconsulta({ motivoInterconsulta: '=HYPERLINK("http://x")' });
    exportarInterconsulta(ic, "csv", config);
    expect(await textoDe(descargas[0].blob)).toContain(`"'=HYPERLINK(""http://x"")"`);
  });

  it("descarga un XLSX real que se puede volver a leer", async () => {
    const ic = crearInterconsulta({ id: "ic-5", motivoInterconsulta: "+56 9 1234" });
    exportarInterconsulta(ic, "xlsx", config);
    expect(descargas[0].nombre).toBe("interconsulta-ic-5.xlsx");
    const filas = await filasXlsx(descargas[0].blob);
    expect(filas[0][0]).toBe("ID");
    expect(filas[1][0]).toBe("ic-5");
    expect(filas[1][3]).toBe("'+56 9 1234");
  });
});

describe("exportación múltiple", () => {
  const lista = [crearInterconsulta({ id: "m-1" }), crearInterconsulta({ id: "m-2" })];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 4, 9, 5, 7));
    return () => vi.useRealTimers();
  });

  it("nombra el archivo con la fecha y hora de la descarga", () => {
    exportarInterconsultas(lista, "csv", config);
    expect(descargas[0].nombre).toBe("interconsultas-ic-20261004-090507.csv");
  });

  it("escribe una fila por interconsulta en CSV", async () => {
    exportarInterconsultas(lista, "csv", config);
    const lineas = (await textoDe(descargas[0].blob)).trim().split("\r\n");
    expect(lineas).toHaveLength(3);
    expect(lineas[2]).toContain('"m-2"');
  });

  it("incluye el total en el JSON", async () => {
    exportarInterconsultas(lista, "json", config);
    const json = JSON.parse(await textoDe(descargas[0].blob));
    expect(json.total).toBe(2);
    expect(json.interconsultas.map((ic: { ID: string }) => ic.ID)).toEqual(["m-1", "m-2"]);
  });

  it("escribe todas las filas en el XLSX", async () => {
    exportarInterconsultas(lista, "xlsx", config);
    expect(await filasXlsx(descargas[0].blob)).toHaveLength(3);
  });

  it("no descarga nada si no hay interconsultas seleccionadas", () => {
    exportarInterconsultas([], "csv", config);
    exportarInterconsultas([], "xlsx", config);
    expect(descargas).toHaveLength(0);
  });
});
