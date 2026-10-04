/**
 * Explicación de la prioridad que sugiere el modelo: SHAP por campo.
 *
 * Mantiene los nombres del backend (snake_case), igual que las entidades del
 * NER: es un contrato que se lee tal cual, no un dato que el frontend arme.
 *
 * Probabilidades y aportes en puntos porcentuales (0-100), como `prob_alta`.
 */

import type { NivelPrioridad } from "./interconsulta";

/** Los ocho campos que el modelo lee, en el orden en que los concatena. */
export type CampoModelo =
  | "espec_origen"
  | "edad"
  | "sexo"
  | "espec_destino"
  | "historia_clinica"
  | "fundamentos_diagnostico"
  | "examenes_complementarios"
  | "motivo_interconsulta";

export interface AporteCampo {
  campo: CampoModelo;
  /** Puntos que el campo suma (+) o resta (-) a la probabilidad de la clase. */
  aporte: number;
  vacio: boolean;
  /** Tenía texto pero quedó entero tras el límite de tokens: el modelo no lo
   *  leyó, así que no aporta. */
  no_leido: boolean;
}

/** Una palabra con su aporte. `inicio`/`fin` son offsets sobre el texto
 *  original del campo, así que texto.slice(inicio, fin) la reconstruye. */
export interface PalabraAtribuida {
  texto: string;
  inicio: number;
  fin: number;
  /** Puntos que cambia la probabilidad si se borra solo esta palabra
   *  (+ = empuja hacia la clase). En un campo de una sola palabra, el aporte
   *  exacto del campo. */
  aporte: number;
}

export interface ExplicacionShap {
  version: number;
  /** Clase que se explica: la sugerida por el modelo al calcular. */
  clase: NivelPrioridad;
  probabilidades: Record<NivelPrioridad, number>;
  generada_en: string;
  segundos: number;
  /** Probabilidad de la clase con todos los campos vacíos. */
  base: number;
  /** Probabilidad con la interconsulta completa: la confianza del modelo.
   *  base + Σ aportes = final. */
  final: number;
  coaliciones: number;
  /** Textos distintos que hubo que predecir (menos si hay campos vacíos). */
  evaluadas: number;
  campos: AporteCampo[];
  /** Campo → sus palabras leídas, en orden. No suman el aporte del campo:
   *  dos palabras que dicen lo mismo se cubren entre sí. */
  palabras: Partial<Record<CampoModelo, PalabraAtribuida[]>>;
  /** Campo → offset desde el cual el modelo ya no leyó (límite de tokens). */
  no_leido: Partial<Record<CampoModelo, number>>;
}

export type EstadoTrabajo =
  | "sin_explicacion"
  | "en_cola"
  | "calculando"
  | "lista"
  | "error";

export interface ProgresoExplicacion {
  /** Primero el aporte de cada campo, después cómo se reparte entre las
   *  palabras. */
  fase: "preparando" | "calculando" | "palabras";
  hechos: number;
  total: number;
}

/** En qué va la explicación. El cálculo corre en segundo plano porque tarda
 *  minutos: el frontend lo lanza y pregunta por este estado hasta que termine. */
export interface EstadoExplicacion {
  estado: EstadoTrabajo;
  progreso: ProgresoExplicacion | null;
  /** Explicaciones que esperan antes que esta. Solo con estado en_cola. */
  delante: number | null;
  error: string | null;
  resultado: ExplicacionShap | null;
}
