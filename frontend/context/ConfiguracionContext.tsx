"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
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

export function ConfiguracionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfiguracionCampos>(() => {
    if (typeof window === "undefined") return DEFAULT_CONFIG;
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado) {
        const parsed = JSON.parse(guardado) as Partial<ConfiguracionCampos>;

        // Detectar si la config guardada es obsoleta (contiene claves que no
        // están en TODOS_LOS_CAMPOS, p. ej. PACIENTE_NOMBRE del perfil viejo).
        const exportGuardado = Array.isArray(parsed.camposExport) ? parsed.camposExport : [];
        const importGuardado = Array.isArray(parsed.camposObligatoriosImport) ? parsed.camposObligatoriosImport : [];

        // Claves que la UI puede mostrar: el catalogo completo. Antes se armaba
        // con DEFAULT_CONFIG, que solo trae los activados de fabrica, asi que
        // marcar cualquier campo no-por-defecto volvia "obsoleta" la config y la
        // borraba entera en la siguiente carga.
        const clavesConocidas = new Set(TODOS_LOS_CAMPOS.map((c) => c.clave));

        const exportTieneObsoletos = exportGuardado.some(c => !clavesConocidas.has(c));
        const importTieneObsoletos = importGuardado.some(c => !clavesConocidas.has(c));

        // Si la config guardada es obsoleta, ignorar localStorage y usar defaults
        if (exportTieneObsoletos || importTieneObsoletos) {
          return DEFAULT_CONFIG;
        }

        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          perfiles: { ...DEFAULT_CONFIG.perfiles, ...(parsed.perfiles ?? {}) },
        };
      }
    } catch {
      // Ignorar errores de parsing
    }
    return DEFAULT_CONFIG;
  });

  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    // Inicializar como médico por defecto para que la página de configuración
    // sea accesible sin necesidad de entrar primero a una interconsulta.
    // La página de detalle sobreescribe este valor con el rol real del usuario.
    if (typeof window === "undefined") return null;
    return {
      id: "default",
      nombre: "Médico",
      rol: "medico",
    };
  });

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