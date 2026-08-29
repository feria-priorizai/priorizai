"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import type { ConfiguracionCampos, PerfilConfiguracion, Usuario } from "@/types/campos";
import { DEFAULT_CONFIG, mergeConfigPerfil } from "@/types/campos";

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

export function ConfiguracionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfiguracionCampos>(() => {
    if (typeof window === "undefined") return DEFAULT_CONFIG;
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado) {
        const parsed = JSON.parse(guardado);
        // Merge con defaults para manejar nuevos campos
        return { ...DEFAULT_CONFIG, ...parsed, perfiles: { ...DEFAULT_CONFIG.perfiles, ...parsed.perfiles } };
      }
    } catch {
      // Ignorar errores de parsing
    }
    return DEFAULT_CONFIG;
  });

  const [usuario, setUsuario] = useState<Usuario | null>(null);

  // Persistir en localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config]);

  // Permisos: ambos roles pueden ver, solo admin puede editar
  const puedeVer = usuario?.rol === "admin" || usuario?.rol === "medico";
  const puedeEditar = usuario?.rol === "admin" || usuario?.rol === "medico";

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