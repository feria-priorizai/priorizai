"use client";

import type { Interconsulta } from "@/types";
import * as XLSX from "xlsx";
import type { ConfiguracionCampos } from "@/types/campos";
import { getCampoPorClave } from "@/types/campos";

/**
 * Utilidades de exportación dinámicas basadas en configuración.
 * Reemplazan las funciones hardcodeadas en page.tsx
 */

// Mapeo de claves de config a propiedades de Interconsulta (incluye campos computados)
const MAPEO_CAMPOS: Record<string, (ic: Interconsulta) => string | number | undefined> = {
  // Datos base
  ID: ic => ic.id,
  PACIENTE_ID: ic => ic.pacienteId,
  // PACIENTE_NOMBRE y PACIENTE_RUT se retiraron: el backend no guarda datos de
  // paciente y el frontend los inventaba ("Paciente 3f2a1b8c", "XX.XXX.XXX-X").
  // Exportarlos sacaba identidad ficticia de la app en un archivo descargable.
  // No estaban en TODOS_LOS_CAMPOS, asi que ninguna configuracion los usaba.
  PACIENTE_EDAD: ic => ic.pacienteEdad,
  ESPECIALIDAD: ic => ic.especialidad,
  CENTRO_ORIGEN: ic => ic.centroOrigen,
  DIAGNOSTICO: ic => ic.diagnostico,
  MOTIVO_INTERCONSULTA: ic => ic.motivoInterconsulta,
  ES_VALIDA_PARA_PRIORIZACION: ic => (ic.esValidaParaPriorizacion === undefined ? undefined : String(ic.esValidaParaPriorizacion)),
  ESTADO: ic => ic.estado,
  PRIORIDAD_ACTUAL: ic => ic.prioridadActual,
  FECHA_INGRESO: ic => ic.fechaIngreso,
  FECHA_ACTUALIZACION: ic => ic.fechaActualizacion,

  // IA / Priorización
  NIVEL_SUGERIDO_IA: ic => ic.priorizacionIA?.nivelSugerido,
  CONFIANZA_IA: ic => ic.priorizacionIA?.confianza,
  PROB_BAJA: ic => ic.priorizacionIA?.probabilidades?.baja,
  PROB_MEDIA: ic => ic.priorizacionIA?.probabilidades?.media,
  PROB_ALTA: ic => ic.priorizacionIA?.probabilidades?.alta,
  JUSTIFICACION_IA: ic => ic.priorizacionIA?.justificacion,
  PRIORIZADA_IA: ic => (ic.priorizacionIA?.priorizada === undefined ? undefined : String(ic.priorizacionIA?.priorizada)),

  // Campos crudos del backend (sin alias)
  EDAD: ic => ic.edad ?? ic.pacienteEdad,
  SEXO: ic => ic.sexo,
  ESPEC_ORIGEN: ic => ic.especOrigen,
  ESPEC_DESTINO: ic => ic.especDestino,
  HISTORIA_CLINICA: ic => ic.historiaClinica,
  FUNDAMENTOS_DIAGNOSTICO: ic => ic.fundamentosDiagnostico,
  EXAMENES_COMPLEMENTARIOS: ic => ic.examenesComplementarios ?? undefined,
  PRIORIDAD_ORIGINAL_CSV: ic => ic.prioridadOriginalCsv ?? undefined,
};

/**
 * Prepara los datos de una interconsulta para export según configuración
 */
export function prepararDatosParaExport(
  interconsulta: Interconsulta,
  config: ConfiguracionCampos
): Record<string, string | number | undefined> {
  const resultado: Record<string, string | number | undefined> = {};

  for (const clave of config.camposExport) {
    const mapper = MAPEO_CAMPOS[clave];
    if (mapper) {
      resultado[clave] = mapper(interconsulta);
    } else {
      // Fallback: intentar acceder directamente a la propiedad (solo si existe en el tipo)
      resultado[clave] = (interconsulta as unknown as Record<string, unknown>)[clave] as string | number | undefined;
    }
  }

  return resultado;
}

/**
 * Genera headers y fila de datos para CSV
 */
export function generarDatosCSV(
  interconsulta: Interconsulta,
  config: ConfiguracionCampos
): { headers: string[]; fila: string[] } {
  const headers: string[] = [];
  const fila: string[] = [];

  for (const clave of config.camposExport) {
    const campoDef = getCampoPorClave(clave);
    const etiqueta = campoDef?.etiqueta ?? clave;

    headers.push(etiqueta);

    const mapper = MAPEO_CAMPOS[clave];
    let valor: string | number | undefined;
    if (mapper) {
      valor = mapper(interconsulta);
    } else {
      valor = (interconsulta as unknown as Record<string, unknown>)[clave] as string | number | undefined;
    }

    // Convertir a string y escapar comillas
    const valorStr = valor === undefined || valor === null ? "" : String(valor);
    fila.push(valorStr);
  }

  return { headers, fila };
}

/**
 * Neutraliza la inyección de fórmulas: Excel y LibreOffice ejecutan cualquier
 * celda que empiece con = + - @ (o tab/retorno). El texto clínico viene de un
 * archivo externo, así que es una fuente que la aplicación no controla.
 */
function neutralizarFormula(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

/** Escapa una celda para CSV: comillas dobladas y fórmulas neutralizadas. */
function escaparCSV(valor: string): string {
  return `"${neutralizarFormula(valor).replace(/"/g, '""')}"`;
}

/**
 * Descarga un archivo (genérico)
 */
function descargarArchivo(
  contenido: BlobPart,
  nombreArchivo: string,
  mimeType: string,
) {
  const blob = new Blob([contenido], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exporta a JSON
 */
export function descargarJSON(
  interconsulta: Interconsulta,
  config: ConfiguracionCampos,
  nombreBase: string = "interconsulta"
) {
  const datos = prepararDatosParaExport(interconsulta, config);
  const payload = {
    exportadoEn: new Date().toISOString(),
    formato: "priorizai.interconsulta.v1",
    interconsulta: datos,
  };
  const contenido = JSON.stringify(payload, null, 2);
  descargarArchivo(contenido, `${nombreBase}-${interconsulta.id}.json`, "application/json");
}

/**
 * Exporta a CSV
 */
export function descargarCSV(
  interconsulta: Interconsulta,
  config: ConfiguracionCampos,
  nombreBase: string = "interconsulta"
) {
  const { headers, fila } = generarDatosCSV(interconsulta, config);
  const contenido = componerCSV(headers, [fila]);
  descargarArchivo(contenido, `${nombreBase}-${interconsulta.id}.csv`, "text/csv");
}

/**
 * Exporta a XLSX. Antes escribía un CSV con extensión .xlsx y el MIME de
 * Excel: el usuario elegía "XLSX" y recibía un archivo que Excel abría con
 * advertencia de formato corrupto.
 */
export function descargarXLSX(
  interconsulta: Interconsulta,
  config: ConfiguracionCampos,
  nombreBase: string = "interconsulta"
) {
  const { headers, fila } = generarDatosCSV(interconsulta, config);
  descargarLibroXLSX(headers, [fila], `${nombreBase}-${interconsulta.id}.xlsx`);
}

/**
 * Función unificada de exportación
 */
export function exportarInterconsulta(
  interconsulta: Interconsulta,
  formato: "json" | "csv" | "xlsx",
  config: ConfiguracionCampos
) {
  switch (formato) {
    case "json":
      return descargarJSON(interconsulta, config);
    case "csv":
      return descargarCSV(interconsulta, config);
    case "xlsx":
      return descargarXLSX(interconsulta, config);
  }
}

/**
 * Genera nombre de archivo único con timestamp exacto (año-mes-día-hora-min-seg)
 */
function generarNombreArchivo(): string {
  const ahora = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `ic-${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}-${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;
}

/**
 * Exporta múltiples interconsultas a JSON (array de objetos)
 */
export function descargarJSONMultiple(
  interconsultas: Interconsulta[],
  config: ConfiguracionCampos,
  nombreBase: string = "interconsultas"
) {
  const datos = interconsultas.map((ic) => prepararDatosParaExport(ic, config));
  const payload = {
    exportadoEn: new Date().toISOString(),
    formato: "priorizai.interconsultas.v1",
    total: interconsultas.length,
    interconsultas: datos,
  };
  const contenido = JSON.stringify(payload, null, 2);
  descargarArchivo(contenido, `${nombreBase}-${generarNombreArchivo()}.json`, "application/json");
}

/**
 * Exporta múltiples interconsultas a CSV (una fila por interconsulta)
 */
export function descargarCSVMultiple(
  interconsultas: Interconsulta[],
  config: ConfiguracionCampos,
  nombreBase: string = "interconsultas"
) {
  if (interconsultas.length === 0) return;

  // Headers basados en la primera interconsulta
  const { headers } = generarDatosCSV(interconsultas[0], config);
  const filas: string[][] = interconsultas.map((ic) => generarDatosCSV(ic, config).fila);
  const contenido = componerCSV(headers, filas);
  descargarArchivo(contenido, `${nombreBase}-${generarNombreArchivo()}.csv`, "text/csv");
}

/** Exporta múltiples interconsultas a un XLSX real de una hoja. */
export function descargarXLSXMultiple(
  interconsultas: Interconsulta[],
  config: ConfiguracionCampos,
  nombreBase: string = "interconsultas"
) {
  if (interconsultas.length === 0) return;

  const { headers } = generarDatosCSV(interconsultas[0], config);
  const filas: string[][] = interconsultas.map((ic) => generarDatosCSV(ic, config).fila);
  descargarLibroXLSX(headers, filas, `${nombreBase}-${generarNombreArchivo()}.xlsx`);
}

/**
 * Función unificada de exportación múltiple
 */
export function exportarInterconsultas(
  interconsultas: Interconsulta[],
  formato: "json" | "csv" | "xlsx",
  config: ConfiguracionCampos
) {
  switch (formato) {
    case "json":
      return descargarJSONMultiple(interconsultas, config);
    case "csv":
      return descargarCSVMultiple(interconsultas, config);
    case "xlsx":
      return descargarXLSXMultiple(interconsultas, config);
  }
}

/**
 * Arma el CSV completo. BOM y CRLF para que Excel en español no rompa las
 * tildes ni junte todo en una sola línea.
 */
function componerCSV(headers: string[], filas: string[][]): string {
  const lineas = [
    headers.map(escaparCSV).join(","),
    ...filas.map((fila) => fila.map(escaparCSV).join(",")),
  ];
  return `\ufeff${lineas.join("\r\n")}\r\n`;
}

/** Escribe un .xlsx de verdad (una hoja) y lo descarga. */
function descargarLibroXLSX(
  headers: string[],
  filas: string[][],
  nombreArchivo: string,
) {
  const hoja = XLSX.utils.aoa_to_sheet([
    headers,
    ...filas.map((fila) => fila.map(neutralizarFormula)),
  ]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Interconsultas");
  const bytes = XLSX.write(libro, { bookType: "xlsx", type: "array" });
  descargarArchivo(
    bytes,
    nombreArchivo,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
