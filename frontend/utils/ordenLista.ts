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

/** El orden exacto en que la lista muestra las interconsultas, en ambas vistas. */
export function ordenarComoLista(interconsultas: Interconsulta[]): Interconsulta[] {
  return agruparPorPrioridad(interconsultas).flatMap((g) => g.items);
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
