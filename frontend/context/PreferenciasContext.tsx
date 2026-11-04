"use client";

/**
 * Preferencias de interfaz de la cuenta. El cambio se aplica de inmediato y se
 * guarda después: la letra no puede esperar a la red para crecer.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useSesion } from "@/context/SesionContext";
import { guardarPreferencias } from "@/services/auth";
import type { Preferencias, Tema } from "@/types/usuario";
import {
  aplicarPreferencias,
  escucharTemaDelSistema,
  guardarPreferenciasLocales,
  PREFERENCIAS_INICIALES,
  temaDelSistema,
} from "@/utils/preferencias";

interface PreferenciasState {
  preferencias: Preferencias;
  /** El tema que se está viendo, también cuando se sigue al sistema operativo. */
  temaActivo: Tema;
  cambiarPreferencias: (cambios: Partial<Preferencias>) => void;
  error: string | null;
}

const PreferenciasContext = createContext<PreferenciasState | null>(null);

export function PreferenciasProvider({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const [preferencias, setPreferencias] = useState<Preferencias>(() =>
    usuario
      ? {
          tema: usuario.tema,
          tamano_letra: usuario.tamano_letra,
          modo_interfaz: usuario.modo_interfaz,
        }
      : PREFERENCIAS_INICIALES,
  );
  const [error, setError] = useState<string | null>(null);
  const temaSistema = useSyncExternalStore(
    escucharTemaDelSistema,
    temaDelSistema,
    () => "claro" as const,
  );
  const temaActivo = preferencias.tema ?? temaSistema;

  useEffect(() => {
    aplicarPreferencias(preferencias);
    guardarPreferenciasLocales(preferencias);
  }, [preferencias, temaSistema]);

  const cambiarPreferencias = useCallback((cambios: Partial<Preferencias>) => {
    setPreferencias((actuales) => ({ ...actuales, ...cambios }));
    setError(null);
    guardarPreferencias(cambios).catch(() =>
      setError(
        "El cambio se aplicó, pero no se pudo guardar en tu cuenta. Intenta nuevamente.",
      ),
    );
  }, []);

  return (
    <PreferenciasContext.Provider
      value={{ preferencias, temaActivo, cambiarPreferencias, error }}
    >
      {children}
    </PreferenciasContext.Provider>
  );
}

export function usePreferencias(): PreferenciasState {
  const contexto = useContext(PreferenciasContext);
  if (!contexto) {
    throw new Error("usePreferencias debe usarse dentro de PreferenciasProvider");
  }
  return contexto;
}
