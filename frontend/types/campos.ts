/**
 * Definiciones unificadas de campos para import/export de interconsultas.
 * Fuente única de verdad para configuración de campos.
 */

export type TipoCampo = "string" | "number" | "date" | "enum";
export type GrupoCampo = "paciente" | "clinico" | "priorizacion" | "metadatos";
export type PerfilConfiguracion = "medico" | "admin";

export interface DefinicionCampo {
  clave: string;
  etiqueta: string;
  descripcion?: string;
  tipo: TipoCampo;
  obligatorioPorDefecto: boolean;
  exportablePorDefecto: boolean;
  grupo: GrupoCampo;
  soloAdmin?: boolean; // Campo solo visible/editable por admin
}

export const TODOS_LOS_CAMPOS: DefinicionCampo[] = [
  // Paciente
  { clave: "ESPEC_ORIGEN", etiqueta: "Especialidad Origen", tipo: "string", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "paciente" },
  { clave: "EDAD", etiqueta: "Edad", tipo: "number", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "paciente" },
  { clave: "SEXO", etiqueta: "Sexo", tipo: "enum", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "paciente" },
  // Clínico
  { clave: "ESPEC_DESTINO", etiqueta: "Especialidad Destino", tipo: "string", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "clinico" },
  { clave: "HISTORIA_CLINICA", etiqueta: "Historia Clínica", tipo: "string", obligatorioPorDefecto: true, exportablePorDefecto: false, grupo: "clinico" },
  { clave: "FUNDAMENTOS_DIAGNOSTICO", etiqueta: "Fundamentos Diagnóstico", tipo: "string", obligatorioPorDefecto: false, exportablePorDefecto: false, grupo: "clinico" },
  { clave: "EXAMENES_COMPLEMENTARIOS", etiqueta: "Exámenes Complementarios", tipo: "string", obligatorioPorDefecto: false, exportablePorDefecto: false, grupo: "clinico" },
  { clave: "MOTIVO_INTERCONSULTA", etiqueta: "Motivo Interconsulta", tipo: "string", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "clinico" },
  // Priorización (del modelo IA / CSV original)
  { clave: "PRIORIDAD", etiqueta: "Prioridad Original (CSV)", tipo: "enum", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "priorizacion" },
  // Metadatos del sistema
  { clave: "ID", etiqueta: "ID", tipo: "string", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "metadatos" },
  { clave: "ESTADO", etiqueta: "Estado", tipo: "enum", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "metadatos" },
  { clave: "PRIORIDAD_ACTUAL", etiqueta: "Prioridad Actual", tipo: "enum", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "priorizacion" },
  { clave: "JUSTIFICACION_IA", etiqueta: "Justificación IA", tipo: "string", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "priorizacion" },
  { clave: "FECHA_INGRESO", etiqueta: "Fecha Ingreso", tipo: "date", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "metadatos" },
  { clave: "FECHA_ACTUALIZACION", etiqueta: "Fecha Actualización", tipo: "date", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "metadatos" },
];

export interface ConfiguracionCampos {
  perfil: PerfilConfiguracion;
  camposObligatoriosImport: string[];
  camposExport: string[];
  perfiles: Record<PerfilConfiguracion, Partial<Pick<ConfiguracionCampos, "camposObligatoriosImport" | "camposExport">>>;
}

// Configuración por defecto para cada perfil
export const PERFILES_DEFAULT: Record<PerfilConfiguracion, Partial<Pick<ConfiguracionCampos, "camposObligatoriosImport" | "camposExport">>> = {
  medico: {
    camposExport: [
      "ID", "PACIENTE_NOMBRE", "PACIENTE_RUT", "PACIENTE_EDAD",
      "ESPECIALIDAD", "CENTRO_ORIGEN", "DIAGNOSTICO", "MOTIVO_INTERCONSULTA",
      "ESTADO", "PRIORIDAD_ACTUAL", "JUSTIFICACION_IA",
      "FECHA_INGRESO", "FECHA_ACTUALIZACION"
    ],
  },
  admin: {
    camposExport: TODOS_LOS_CAMPOS.map(c => c.clave),
  },
};

// Configuración global por defecto
export const DEFAULT_CONFIG: ConfiguracionCampos = {
  perfil: "medico",
  camposObligatoriosImport: TODOS_LOS_CAMPOS.filter(c => c.obligatorioPorDefecto).map(c => c.clave),
  camposExport: TODOS_LOS_CAMPOS.filter(c => c.exportablePorDefecto).map(c => c.clave),
  perfiles: PERFILES_DEFAULT,
};

// Utilidades
export function getCamposPorGrupo(grupo: GrupoCampo): DefinicionCampo[] {
  return TODOS_LOS_CAMPOS.filter(c => c.grupo === grupo);
}

export function getCampoPorClave(clave: string): DefinicionCampo | undefined {
  return TODOS_LOS_CAMPOS.find(c => c.clave === clave);
}

export function mergeConfigPerfil(config: ConfiguracionCampos, perfil: PerfilConfiguracion): ConfiguracionCampos {
  // Solo aplicar el override del perfil si la config actual todavía coincide
  // con el default global (es decir, el usuario no ha personalizado nada aún).
  // Esto permite que los cambios del usuario persistan entre renders.
  const override = PERFILES_DEFAULT[perfil];
  const defaultGlobal = DEFAULT_CONFIG.camposExport;
  const esDefaultGlobal =
    config.camposExport.length === defaultGlobal.length &&
    defaultGlobal.every(c => config.camposExport.includes(c));

  return {
    ...config,
    perfil,
    camposExport: esDefaultGlobal && override?.camposExport
      ? override.camposExport
      : config.camposExport,
  };
}