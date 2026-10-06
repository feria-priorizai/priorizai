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
import { useSesion } from "@/context/SesionContext";
import type { ConfiguracionCampos, PerfilConfiguracion, Usuario as UsuarioConfig } from "@/types/campos";
import type { RolUsuario, Usuario } from "@/types/usuario";
import { DEFAULT_CONFIG, mergeConfigPerfil, TODOS_LOS_CAMPOS } from "@/types/campos";

const STORAGE_KEY = "priorizai-config-campos";

interface ConfiguracionState {
  config: ConfiguracionCampos;
  usuario: UsuarioConfig | null;
  puedeVer: boolean;
  puedeEditar: boolean;
  actualizarConfigImport: (campos: string[]) => void;
  actualizarConfigExport: (campos: string[]) => void;
  restablecerDefaults: () => void;
  setPerfil: (perfil: PerfilConfiguracion) => void;
}

const ConfiguracionContext = createContext<ConfiguracionState | null>(null);

/**
 * Mapea el rol del usuario autenticado al perfil de configuración.
 * El backend usa "medico" / "administrador"; la config usa "medico" / "admin".
 */
function mapearRolConfiguracion(rol: RolUsuario): PerfilConfiguracion {
  return rol === "administrador" ? "admin" : "medico";
}

/**
 * Convierte el usuario de la sesión al formato que espera la configuración.
 */
function adaptarUsuario(usuario: Usuario | null): UsuarioConfig | null {
  if (!usuario) return null;
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    rol: mapearRolConfiguracion(usuario.rol),
  };
}

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

  // Obtener el usuario real desde SesionContext y adaptarlo
  const { usuario: usuarioSesion } = useSesion();
  const usuario = adaptarUsuario(usuarioSesion);

  useEffect(() => {
    if (leido) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config, leido]);

  // Derivar permisos exclusivamente del rol real del usuario autenticado
  const esAdministrador = usuarioSesion?.rol === "administrador";
  const puedeVer = esAdministrador;
  const puedeEditar = esAdministrador;

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