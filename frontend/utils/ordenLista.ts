/**
 * Orden visible de la lista de espera y lo que se recuerda de ella entre
 * vistas: la secuencia que se está revisando (HDU-12) y la forma de mostrarla
 * (HDU-14).
 */

import type { Interconsulta, NivelPrioridad } from "@/types";

export type ClaveGrupo = NivelPrioridad | "sin" | "invalida";
export type VistaLista = "tarjetas" | "tabla";

export const GRUPOS: { clave: ClaveGrupo; titulo: string }[] = [
  { clave: "alta", titulo: "Alta" },
  { clave: "media", titulo: "Media" },
  { clave: "baja", titulo: "Baja" },
  { clave: "sin", titulo: "Sin priorizar" },
  { clave: "invalida", titulo: "No priorizables" },
];

export function grupoDe(ic: Interconsulta): ClaveGrupo {
  if (ic.esValidaParaPriorizacion === false) return "invalida";
  if (ic.sinPrioridad) return "sin";
  return ic.prioridadActual;
}

/**
 * Agrupa por prioridad sin alterar el orden que resuelve el backend dentro de
 * cada grupo (HU3-c1 y c3: prioridad, luego fecha de emisión, luego id).
 */
export function agruparPorPrioridad(interconsultas: Interconsulta[]) {
  return GRUPOS.map((g) => ({
    ...g,
    items: interconsultas.filter((ic) => grupoDe(ic) === g.clave),
  })).filter((g) => g.items.length > 0);
}

/** Columnas por las que se puede reordenar la vista tabular. */
export type ColumnaOrden =
  | "folio"
  | "prioridad"
  | "diagnostico"
  | "edad"
  | "origen"
  | "destino"
  | "emision"
  | "certeza"
  | "estado";

export interface OrdenTabla {
  columna: ColumnaOrden;
  descendente: boolean;
}

const RANGO_GRUPO: Record<ClaveGrupo, number> = {
  alta: 0,
  media: 1,
  baja: 2,
  sin: 3,
  invalida: 4,
};

function valorOrden(ic: Interconsulta, columna: ColumnaOrden): string | number {
  switch (columna) {
    case "folio":
      return ic.id;
    case "prioridad":
      return RANGO_GRUPO[grupoDe(ic)];
    case "diagnostico":
      return ic.diagnostico.toLocaleLowerCase("es");
    case "edad":
      return ic.pacienteEdad;
    case "origen":
      return ic.centroOrigen.toLocaleLowerCase("es");
    case "destino":
      return ic.especialidad.toLocaleLowerCase("es");
    case "emision":
      return ic.fechaEmision ?? ic.fechaIngreso;
    case "certeza":
      // Una regla clínica pesa más que cualquier certeza del modelo.
      if (ic.prioridadForzadaPorRegla) return 101;
      return (ic.priorizacionIA.priorizada ?? true) ? ic.priorizacionIA.confianza : -1;
    case "estado":
      return ic.estado;
  }
}

/**
 * Reordena por una columna. El sort es estable, así que a igual valor se
 * conserva el orden de la lista de espera.
 */
export function ordenarPorColumna(
  interconsultas: Interconsulta[],
  { columna, descendente }: OrdenTabla,
): Interconsulta[] {
  const signo = descendente ? -1 : 1;
  return [...interconsultas].sort((a, b) => {
    const va = valorOrden(a, columna);
    const vb = valorOrden(b, columna);
    if (va === vb) return 0;
    return (va < vb ? -1 : 1) * signo;
  });
}

// El almacenamiento puede no existir o lanzar (modo privado, cuota llena):
// en ese caso se pierde la comodidad, nunca la vista.

const CLAVE_ORDEN = "pz:orden-lista";

/** Guarda la secuencia de la lista para navegar desde el detalle. Vive en la pestaña. */
export function guardarOrdenLista(ids: string[]): void {
  try {
    sessionStorage.setItem(CLAVE_ORDEN, JSON.stringify(ids));
  } catch {
    /* sin almacenamiento, sin navegación */
  }
}

export function leerOrdenLista(): string[] {
  try {
    const crudo = sessionStorage.getItem(CLAVE_ORDEN);
    const ids: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** La vista preferida es por usuario y persiste al cerrar sesión. */
const claveVista = (usuarioId: string) => `pz:vista-lista:${usuarioId}`;

export function leerVistaPreferida(usuarioId: string): VistaLista {
  try {
    return localStorage.getItem(claveVista(usuarioId)) === "tabla"
      ? "tabla"
      : "tarjetas";
  } catch {
    return "tarjetas";
  }
}

export function guardarVistaPreferida(usuarioId: string, vista: VistaLista): void {
  try {
    localStorage.setItem(claveVista(usuarioId), vista);
  } catch {
    /* la preferencia dura solo esta visita */
  }
}
