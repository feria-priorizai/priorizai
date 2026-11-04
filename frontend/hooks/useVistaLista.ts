"use client";

import { useCallback, useState } from "react";
import { usePreferencias } from "@/context/PreferenciasContext";
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
 * El modo legacy (HDU-17) es siempre tabla, sin perder la vista recordada.
 */
export function useVistaLista(): [VistaLista, (vista: VistaLista) => void] {
  const { usuario } = useSesion();
  const usuarioId = usuario?.id ?? null;
  const { modo_interfaz: modo } = usePreferencias().preferencias;
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

  return [modo === "legacy" ? "tabla" : vista, cambiarVista];
}
