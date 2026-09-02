"use client";

import { useConfiguracion } from "@/context/ConfiguracionContext";
import { DEFAULT_CONFIG, mergeConfigPerfil } from "@/types/campos";

/**
 * Hook para acceder a la configuración de campos de import/export
 * con filtrado automático por perfil de usuario.
 */
export function useConfiguracionCampos() {
  const { config, usuario, puedeEditar, actualizarConfigImport, actualizarConfigExport, restablecerDefaults, setPerfil, setUsuario } = useConfiguracion();

  // Configuración efectiva según perfil del usuario
  const perfilActual = usuario?.rol ?? "medico";
  // Fallback a DEFAULT_CONFIG si mergeConfigPerfil falla por alguna razón
  const configEfectiva = mergeConfigPerfil(config ?? DEFAULT_CONFIG, perfilActual);

  return {
    // Estado
    config: configEfectiva,
    usuario,
    puedeEditar,
    perfilActual,

    // Acciones
    actualizarConfigImport,
    actualizarConfigExport,
    restablecerDefaults,
    setPerfil,
    setUsuario,
  };
}

/**
 * Hook específico para configuración de import
 */
export function useConfiguracionImport() {
  const { config, actualizarConfigImport, puedeEditar, ...resto } = useConfiguracionCampos();

  const toggleCampo = (clave: string) => {
    const nuevos = config.camposObligatoriosImport.includes(clave)
      ? config.camposObligatoriosImport.filter(c => c !== clave)
      : [...config.camposObligatoriosImport, clave];
    actualizarConfigImport(nuevos);
  };

  // Reemplaza el set completo de obligatorios en una sola actualización
  // (necesario para "Seleccionar/Deseleccionar todos" — varios toggles
  // sucesivos se perderían porque cada uno lee la versión anterior del array).
  const setObligatorios = (claves: string[]) => {
    actualizarConfigImport(claves);
  };

  return {
    camposObligatorios: config.camposObligatoriosImport,
    toggleCampo,
    setObligatorios,
    puedeEditar,
    ...resto,
  };
}

/**
 * Hook específico para configuración de export
 */
export function useConfiguracionExport() {
  const { config, actualizarConfigExport, puedeEditar, setUsuario, usuario, ...resto } = useConfiguracionCampos();

  const toggleCampo = (clave: string) => {
    const nuevos = config.camposExport.includes(clave)
      ? config.camposExport.filter(c => c !== clave)
      : [...config.camposExport, clave];
    actualizarConfigExport(nuevos);
  };

  // Reemplaza el set completo de exportables en una sola actualización
  const setExportables = (claves: string[]) => {
    actualizarConfigExport(claves);
  };

  return {
    config, // configEfectiva con camposExport garantizado
    camposExport: config.camposExport,
    toggleCampo,
    setExportables,
    puedeEditar,
    setUsuario,
    usuario,
    ...resto,
  };
}
