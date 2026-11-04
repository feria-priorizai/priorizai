/**
 * Plazos de revisión por prioridad e interconsultas atrasadas (HDU-22).
 */

import type { Interconsulta, NivelPrioridad, PlazosRevision } from "@/types";

/** De la más urgente a la menos urgente, como las valida el backend. */
export const NIVELES_PLAZO: NivelPrioridad[] = ["alta", "media", "baja"];

/** El mismo tope que aplica el backend: diez años. */
export const PLAZO_MAXIMO = 3650;

export type ResultadoValidacionPlazos =
  | { ok: true; plazos: PlazosRevision }
  | { ok: false; nivel: NivelPrioridad; error: string };

/**
 * Por qué no sirve lo que se escribió en un plazo, o null si sirve. Lo muestra
 * el formulario debajo del campo mientras se escribe.
 */
export function errorDePlazo(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return "Ingresa el plazo en días.";
  const dias = Number(limpio);
  if (Number.isNaN(dias)) return "Valor inválido: ingresa un número de días.";
  if (dias <= 0) return "Valor inválido: el plazo debe ser mayor que 0 días.";
  // Solo dígitos: Number aceptaría "1e2" o "5.5".
  if (!/^\d+$/.test(limpio)) {
    return "Valor inválido: el plazo debe ser un número entero de días.";
  }
  if (dias > PLAZO_MAXIMO) {
    return `Valor inválido: el plazo no puede superar ${PLAZO_MAXIMO} días.`;
  }
  return null;
}

/**
 * Valida lo que escribió el administrador antes de enviarlo: cada plazo por sí
 * solo y que una prioridad más alta nunca tenga más días que una más baja. El
 * backend repite la validación; esta solo evita el viaje y señala el campo.
 */
export function validarPlazos(
  valores: Record<NivelPrioridad, string>,
): ResultadoValidacionPlazos {
  const plazos = {} as PlazosRevision;
  for (const nivel of NIVELES_PLAZO) {
    const error = errorDePlazo(valores[nivel]);
    if (error) {
      return { ok: false, nivel, error };
    }
    plazos[nivel] = Number(valores[nivel].trim());
  }
  for (let i = 0; i < NIVELES_PLAZO.length - 1; i++) {
    const masAlta = NIVELES_PLAZO[i];
    const masBaja = NIVELES_PLAZO[i + 1];
    if (plazos[masAlta] > plazos[masBaja]) {
      return {
        ok: false,
        nivel: masAlta,
        error: `El plazo de prioridad ${masAlta} no puede ser mayor que el de prioridad ${masBaja}.`,
      };
    }
  }
  return { ok: true, plazos };
}

/**
 * Las atrasadas, de mayor a menor atraso. El sort es estable, así que a igual
 * atraso se conserva el orden de la lista de espera.
 */
export function ordenarPorAtraso(interconsultas: Interconsulta[]): Interconsulta[] {
  return [...interconsultas].sort(
    (a, b) => (b.diasAtraso ?? 0) - (a.diasAtraso ?? 0),
  );
}

/** "1 día", "12 días". */
export function textoDias(dias: number): string {
  return `${dias} ${dias === 1 ? "día" : "días"}`;
}
