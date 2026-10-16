"use client";

import { useCallback, useState } from "react";
import { useSesion } from "@/context/SesionContext";
import {
  guardarVistaPreferida,
  leerVistaPreferida,
  type VistaLista,
} from "@/utils/ordenLista";

/**
 * Vista de la lista de espera (HDU-14): tarjetas o tabla, recordada por
 * usuario. Las vistas que la usan solo se montan con sesión confirmada, así
 * que leer el almacenamiento al iniciar no produce diferencias de hidratación.
 */
export function useVistaLista(): [VistaLista, (vista: VistaLista) => void] {
  const { usuario } = useSesion();
  const usuarioId = usuario?.id ?? null;
  const [vista, setVista] = useState<VistaLista>(() =>
    usuarioId ? leerVistaPreferida(usuarioId) : "tarjetas",
  );

  const cambiarVista = useCallback(
    (nueva: VistaLista) => {
      setVista(nueva);
      if (usuarioId) guardarVistaPreferida(usuarioId, nueva);
    },
    [usuarioId],
  );

  return [vista, cambiarVista];
}
