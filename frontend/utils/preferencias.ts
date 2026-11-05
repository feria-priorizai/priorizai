/**
 * Preferencias de interfaz de la cuenta (HDU-17, HDU-18, HDU-19). Se expresan
 * como atributos en <html> y el resto lo resuelve globals.css: cambiar una no
 * vuelve a montar ninguna vista, así que filtros y selección siguen donde
 * estaban.
 */

import type { Preferencias, TamanoLetra, Tema } from "@/types/usuario";

export const PREFERENCIAS_INICIALES: Preferencias = {
  tema: null,
  tamano_letra: "normal",
  modo_interfaz: "estandar",
};

/** Debe coincidir con el font-size de `html[data-letra]` en globals.css. */
const ESCALA_LETRA: Record<TamanoLetra, number> = {
  normal: 1,
  grande: 1.25,
  muy_grande: 1.5,
};

const CONSULTA_TEMA_OSCURO = "(prefers-color-scheme: dark)";
const ANCHO_MENU_CONTRAIDO = 991.98;

// La copia local solo existe para pintar el primer cuadro antes de que responda
// el backend, que es quien manda. Si no se puede escribir, ese cuadro sale con
// los valores iniciales y nada más.
const CLAVE_PREFERENCIAS = "pz:preferencias";

export function temaDelSistema(): Tema {
  return window.matchMedia(CONSULTA_TEMA_OSCURO).matches ? "oscuro" : "claro";
}

export function aplicarPreferencias(preferencias: Preferencias): void {
  const raiz = document.documentElement;
  const tema = preferencias.tema ?? temaDelSistema();
  raiz.dataset.tema = tema;
  raiz.dataset.bsTheme = tema === "oscuro" ? "dark" : "light";
  raiz.dataset.letra = preferencias.tamano_letra;
  raiz.dataset.modo = preferencias.modo_interfaz;
}

export function guardarPreferenciasLocales(preferencias: Preferencias): void {
  try {
    localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(preferencias));
  } catch {
    /* el próximo primer cuadro sale con los valores iniciales */
  }
}

/** Avisa cuando el sistema operativo cambia de tema. Devuelve cómo dejar de escuchar. */
export function escucharTemaDelSistema(alCambiar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_TEMA_OSCURO);
  consulta.addEventListener("change", alCambiar);
  return () => consulta.removeEventListener("change", alCambiar);
}

/**
 * Los breakpoints no escalan con la letra: a 150 % en 1280 px caben los mismos
 * caracteres que a 100 % en 853 px, pero el menú seguiría abierto.
 */
export function menuNoCabe(tamano: TamanoLetra): boolean {
  const ancho = ANCHO_MENU_CONTRAIDO * ESCALA_LETRA[tamano];
  return window.matchMedia(`(max-width: ${ancho}px)`).matches;
}

/**
 * Corre en <head>, antes del primer cuadro y antes de que cargue React. Hace lo
 * mismo que aplicarPreferencias leyendo la copia local: sin esto, quien usa el
 * tema oscuro ve un destello claro en cada carga.
 */
export const SCRIPT_PREFERENCIAS = `(function(){var p={};try{p=JSON.parse(localStorage.getItem(${JSON.stringify(
  CLAVE_PREFERENCIAS,
)}))||{}}catch(e){}var r=document.documentElement,t=p.tema||(matchMedia(${JSON.stringify(
  CONSULTA_TEMA_OSCURO,
)}).matches?"oscuro":"claro");r.dataset.tema=t;r.dataset.bsTheme=t==="oscuro"?"dark":"light";r.dataset.letra=p.tamano_letra||"normal";r.dataset.modo=p.modo_interfaz||"estandar"})()`;
