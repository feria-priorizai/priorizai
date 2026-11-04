/** Teclas con que se recorre una lista sin salir de ella (HDU-20). */
const TECLAS_LISTA = ["ArrowDown", "ArrowUp", "Home", "End"] as const;

export type TeclaLista = (typeof TECLAS_LISTA)[number];

export function esTeclaLista(tecla: string): tecla is TeclaLista {
  return (TECLAS_LISTA as readonly string[]).includes(tecla);
}

/**
 * Posición a la que lleva cada tecla. En los bordes se queda donde está en vez
 * de dar la vuelta: saltar de la última interconsulta a la primera se confunde
 * con que la lista se reordenó.
 */
export function indiceDestino(tecla: TeclaLista, actual: number, total: number): number {
  if (total === 0) return -1;
  switch (tecla) {
    case "Home":
      return 0;
    case "End":
      return total - 1;
    case "ArrowDown":
      return Math.min(actual + 1, total - 1);
    case "ArrowUp":
      return Math.max(actual - 1, 0);
  }
}

/** Elementos que reciben foco con el tabulador, en el orden del documento. */
const SELECTOR_ENFOCABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function enfocables(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES)).filter(
    (el) => el.tabIndex >= 0 && !el.hidden,
  );
}
