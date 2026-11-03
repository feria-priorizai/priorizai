"use client";

import { useEffect, useRef, type RefObject } from "react";
import { enfocables } from "@/utils/navegacionTeclado";

/**
 * Comportamiento de teclado de un diálogo modal (HDU-20). Mientras está
 * abierto, el tabulador da la vuelta dentro del diálogo y Esc lo cierra; al
 * cerrarse, el foco vuelve al elemento que lo tenía antes de abrirlo.
 *
 * `focoInicialRef` es lo que recibe el foco al abrir; sin él, el primer
 * elemento enfocable del diálogo.
 */
export function useTrampaFoco(
  abierto: boolean,
  dialogoRef: RefObject<HTMLElement | null>,
  onCerrar: () => void,
  focoInicialRef?: RefObject<HTMLElement | null>,
) {
  // El cierre llega como una función nueva en cada render: si fuera
  // dependencia del efecto, cada render devolvería el foco y lo volvería a
  // tomar.
  const cerrarRef = useRef(onCerrar);
  useEffect(() => {
    cerrarRef.current = onCerrar;
  });

  useEffect(() => {
    if (!abierto) {
      return;
    }

    const focoPrevio = document.activeElement as HTMLElement | null;
    const dialogo = dialogoRef.current;
    (focoInicialRef?.current ?? (dialogo && enfocables(dialogo)[0]))?.focus();

    // Un diálogo modal tiene que atrapar el foco: sin esto el tabulador se va a
    // la página de atrás, que el lector de pantalla no debería poder alcanzar.
    const manejarTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cerrarRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogoRef.current) {
        return;
      }
      const elementos = enfocables(dialogoRef.current);
      if (elementos.length === 0) {
        e.preventDefault();
        return;
      }
      const primero = elementos[0];
      const ultimo = elementos[elementos.length - 1];
      const activo = document.activeElement;
      // Si el foco quedó fuera (un clic en el fondo, un botón que se
      // deshabilitó), el siguiente Tab lo trae de vuelta.
      const dentro = activo instanceof Node && dialogoRef.current.contains(activo);
      if (e.shiftKey && (!dentro || activo === primero)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (!dentro || activo === ultimo)) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", manejarTeclado);
    return () => {
      document.removeEventListener("keydown", manejarTeclado);
      if (focoPrevio?.isConnected) focoPrevio.focus();
    };
  }, [abierto, dialogoRef, focoInicialRef]);
}
