"use client";

import type { Interconsulta } from "@/types";
import type { ConfiguracionCampos, DefinicionCampo } from "@/types/campos";
import { TODOS_LOS_CAMPOS, getCampoPorClave } from "@/types/campos";

/**
 * Utilidades de exportación dinámicas basadas en configuración.
 * Reemplazan las funciones hardcodeadas en page.tsx
 */

// Mapeo de claves de config a propiedades de Interconsulta (incluye campos computados)
const MAPEO_CAMPOS: Record<string, (ic: Interconsulta) => string | number | undefined> = {
  // Datos base
  ID: ic => ic.id,
  PACIENTE_ID: ic => ic.pacienteId,
  PACIENTE_NOMBRE: ic => ic.pacienteNombre,
  PACIENTE_RUT: ic => ic.pacienteRut,
  PACIENTE_EDAD: ic => ic.pacienteEdad,
  ESPECIALIDAD: ic => ic.especialidad,
  CENTRO_ORIGEN: ic => ic.centroOrigen,
  DIAGNOSTICO: ic => ic.diagnostico,
  MOTIVO_INTERCONSULTA: ic => ic.motivoInterconsulta,
  ES_VALIDA_PARA_PRIORIZACION: ic => ic.esValidaParaPriorizacion,
  ESTADO: ic => ic.estado,
  PRIORIDAD_ACTUAL: ic => ic.prioridadActual,
  FECHA_INGRESO: ic => ic.fechaIngreso,
  FECHA_ACTUALIZACION: ic => ic.fechaActualizacion,

  // IA / Priorización
  PRIORIDAD: ic => ic.priorizacionIA?.nivelSugerido,
  NIVEL_SUGERIDO_IA: ic => ic.priorizacionIA?.nivelSugerido,
  CONFIANZA_IA: ic => ic.priorizacionIA?.confianza,
  PROB_BAJA: ic => ic.priorizacionIA?.probabilidades?.baja,
  PROB_MEDIA: ic => ic.priorizacionIA?.probabilidades?.media,
  PROB_ALTA: ic => ic.priorizacionIA?.probabilidades?.alta,
  JUSTIFICACION_IA: ic => ic.priorizacionIA?.justificacion,
  PRIORIZADA_IA: ic => ic.priorizacionIA?.priorizada,

  // Campos clínicos detallados (del backend original)
  HISTORIA_CLINICA: ic => undefined, // No está en el tipo frontend, vendría del backend
  FUNDAMENTOS_DIAGNOSTICO: ic => undefined,
  EXAMENES_COMPLEMENTARIOS: ic => undefined,
  SEXO: ic => undefined,
  ESPEC_ORIGEN: ic => undefined,
  ESPEC_DESTINO: ic => undefined,
  PRIORIDAD_ORIGINAL_CSV: ic => undefined,
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
      // Fallback: intentar acceder directamente a la propiedad
      resultado[clave] = (interconsulta as Record<string, unknown>)[clave] as string | number | undefined;
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
      valor = (interconsulta as Record<string, unknown>)[clave] as string | number | undefined;
    }

    // Convertir a string y escapar comillas
    const valorStr = valor === undefined || valor === null ? "" : String(valor);
    fila.push(valorStr);
  }

  return { headers, fila };
}

/**
 * Descarga un archivo (genérico)
 */
function descargarArchivo(contenido: string, nombreArchivo: string, mimeType: string) {
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

  // Escapar comillas y envolver en comillas
  const escapar = (val: string) => `"${val.replace(/"/g, '""')}"`;

  const lineas = [
    headers.map(escapar).join(","),
    fila.map(escapar).join(","),
  ];

  const contenido = lineas.join("\n");
  descargarArchivo(contenido, `${nombreBase}-${interconsulta.id}.csv`, "text/csv");
}

/**
 * Exporta a XLSX (MVP: CSV con extensión .xlsx)
 * Para XLSX real con múltiples hojas, usar librería 'xlsx'
 */
export function descargarXLSX(
  interconsulta: Interconsulta,
  config: ConfiguracionCampos,
  nombreBase: string = "interconsulta"
) {
  const { headers, fila } = generarDatosCSV(interconsulta, config);

  const escapar = (val: string) => `"${val.replace(/"/g, '""')}"`;

  const lineas = [
    headers.map(escapar).join(","),
    fila.map(escapar).join(","),
  ];

  const contenido = lineas.join("\n");
  descargarArchivo(contenido, `${nombreBase}-${interconsulta.id}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
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