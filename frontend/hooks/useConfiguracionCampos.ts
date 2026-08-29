"use client";

import { useConfiguracion } from "@/context/ConfiguracionContext";
import type { ConfiguracionCampos, PerfilConfiguracion, DefinicionCampo, GrupoCampo } from "@/types/campos";
import { DEFAULT_CONFIG, TODOS_LOS_CAMPOS, mergeConfigPerfil } from "@/types/campos";

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
    configGlobal: config,
    usuario,
    puedeEditar,
    perfilActual,

    // Acciones
    actualizarConfigImport,
    actualizarConfigExport,
    restablecerDefaults,
    setPerfil,
    setUsuario,

    // Utilidades de consulta
    esCampoObligatorioImport: (clave: string) => configEfectiva.camposObligatoriosImport.includes(clave),
    esCampoExportable: (clave: string) => configEfectiva.camposExport.includes(clave),
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

  return {
    camposObligatorios: config.camposObligatoriosImport,
    toggleCampo,
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

  return {
    config, // configEfectiva con camposExport garantizado
    camposExport: config.camposExport,
    toggleCampo,
    puedeEditar,
    setUsuario,
    usuario,
    ...resto,
  };
}

/**
 * Hook para obtener campos agrupados por grupo (para UI)
 */
export function useCamposAgrupados() {
  const { esCampoObligatorioImport, esCampoExportable, puedeEditar } = useConfiguracionCampos();

  const grupos: Record<GrupoCampo, DefinicionCampo[]> = {
    paciente: TODOS_LOS_CAMPOS.filter(c => c.grupo === "paciente"),
    clinico: TODOS_LOS_CAMPOS.filter(c => c.grupo === "clinico"),
    priorizacion: TODOS_LOS_CAMPOS.filter(c => c.grupo === "priorizacion"),
    metadatos: TODOS_LOS_CAMPOS.filter(c => c.grupo === "metadatos"),
  };

  return {
    grupos,
    esCampoObligatorioImport,
    esCampoExportable,
    puedeEditar,
  };
}