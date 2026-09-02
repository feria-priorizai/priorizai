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

    // Claves que la UI puede mostrar: el catalogo completo. Antes se armaba con
    // DEFAULT_CONFIG, que solo trae los activados de fabrica, asi que marcar
    // cualquier campo no-por-defecto volvia "obsoleta" la config y la borraba
    // entera en la siguiente carga.
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

/** Sesion por defecto. Constante, no derivada del navegador: si difiriera entre
 *  servidor y cliente, el arbol no hidrataria. */
const USUARIO_POR_DEFECTO: Usuario = {
  id: "default",
  nombre: "Médico",
  rol: "medico",
};

export function ConfiguracionProvider({ children }: { children: ReactNode }) {
  // Arranca siempre en los valores por defecto para que el HTML del servidor y
  // el del primer render del cliente sean identicos. Lo guardado se aplica una
  // vez montado, en el efecto de abajo.
  // El servidor devuelve false y el cliente true. React usa el valor del
  // servidor para hidratar y luego cambia al del cliente, sin desajuste.
  const hidratado = useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
  const [config, setConfig] = useState<ConfiguracionCampos>(DEFAULT_CONFIG);
  const [leido, setLeido] = useState(false);

  // Ajuste de estado durante el render (no en un efecto): asi la configuracion
  // guardada entra en el mismo commit en que React pasa a modo cliente.
  if (hidratado && !leido) {
    setLeido(true);
    const guardada = leerConfigGuardada();
    if (guardada) {
      setConfig(guardada);
    }
  }

  const [usuario, setUsuario] = useState<Usuario | null>(USUARIO_POR_DEFECTO);

  // No se escribe antes de leer: si no, el primer render pisaria en disco la
  // configuracion guardada con los valores por defecto.
  useEffect(() => {
    if (leido) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config, leido]);

  // Permisos: hoy los dos roles pueden ver y editar. Cuando exista login
  // habrá que decidir si la configuración de campos es solo de admin; el
  // comentario anterior decía eso pero el código nunca lo hizo.
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