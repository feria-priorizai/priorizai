"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ConfiguracionCampos, PerfilConfiguracion, Usuario } from "@/types/campos";
import { DEFAULT_CONFIG, mergeConfigPerfil, TODOS_LOS_CAMPOS } from "@/types/campos";

const STORAGE_KEY = "priorizai-config-campos";

interface ConfiguracionState {
  config: ConfiguracionCampos;
  usuario: Usuario | null;
  puedeVer: boolean;
  puedeEditar: boolean;
  actualizarConfigImport: (campos: string[]) => void;
  actualizarConfigExport: (campos: string[]) => void;
  restablecerDefaults: () => void;
  setUsuario: (usuario: Usuario | null) => void;
  setPerfil: (perfil: PerfilConfiguracion) => void;
}

const ConfiguracionContext = createContext<ConfiguracionState | null>(null);

/**
 * Lee la configuracion guardada. Devuelve null si no hay nada utilizable.
 * Vive fuera del componente porque solo puede ejecutarse en el navegador: el
 * servidor no tiene localStorage.
 */
function leerConfigGuardada(): ConfiguracionCampos | null {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (!guardado) return null;

    const parsed = JSON.parse(guardado) as Partial<ConfiguracionCampos>;
    const exportGuardado = Array.isArray(parsed.camposExport)
      ? parsed.camposExport
      : [];
    const importGuardado = Array.isArray(parsed.camposObligatoriosImport)
      ? parsed.camposObligatoriosImport
      : [];

    const clavesConocidas = new Set(TODOS_LOS_CAMPOS.map((c) => c.clave));
    const hayObsoletos =
      exportGuardado.some((c) => !clavesConocidas.has(c)) ||
      importGuardado.some((c) => !clavesConocidas.has(c));

    if (hayObsoletos) return null;

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      perfiles: { ...DEFAULT_CONFIG.perfiles, ...(parsed.perfiles ?? {}) },
    };
  } catch {
    return null;
  }
}

/** Nunca emite cambios: el valor solo depende de si corre en el navegador. */
function sinSuscripcion(): () => void {
  return () => {};
}

const USUARIO_POR_DEFECTO: Usuario = {
  id: "default",
  nombre: "Médico",
  rol: "medico",
};

export function ConfiguracionProvider({ children }: { children: ReactNode }) {
  const hidratado = useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
  const [config, setConfig] = useState<ConfiguracionCampos>(DEFAULT_CONFIG);
  const [leido, setLeido] = useState(false);

  if (hidratado && !leido) {
    setLeido(true);
    const guardada = leerConfigGuardada();
    if (guardada) {
      setConfig(guardada);
    }
  }

  const [usuario, setUsuario] = useState<Usuario | null>(USUARIO_POR_DEFECTO);

  useEffect(() => {
    if (leido) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config, leido]);

  const esUsuarioConocido =
    usuario?.rol === "admin" || usuario?.rol === "medico";
  const puedeVer = esUsuarioConocido;
  const puedeEditar = esUsuarioConocido;

  const actualizarConfigImport = useCallback((campos: string[]) => {
    setConfig(prev => ({ ...prev, camposObligatoriosImport: campos }));
  }, []);

  const actualizarConfigExport = useCallback((campos: string[]) => {
    setConfig(prev => ({ ...prev, camposExport: campos }));
  }, []);

  const restablecerDefaults = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
  }, []);

  const setPerfil = useCallback((perfil: PerfilConfiguracion) => {
    setConfig(prev => mergeConfigPerfil(prev, perfil));
  }, []);

  return (
    <ConfiguracionContext.Provider
      value={{
        config,
        usuario,
        puedeVer,
        puedeEditar,
        actualizarConfigImport,
        actualizarConfigExport,
        restablecerDefaults,
        setUsuario,
        setPerfil,
      }}
    >
      {children}
    </ConfiguracionContext.Provider>
  );
}

export function useConfiguracion() {
  const ctx = useContext(ConfiguracionContext);
  if (!ctx) {
    throw new Error("useConfiguracion debe usarse dentro de ConfiguracionProvider");
  }
  return ctx;
}