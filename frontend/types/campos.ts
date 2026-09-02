/**
 * Definiciones unificadas de campos para import/export de interconsultas.
 * Fuente única de verdad para configuración de campos.
 */

export type TipoCampo = "string" | "number" | "date" | "enum";
export type GrupoCampo = "paciente" | "clinico" | "priorizacion" | "metadatos";
export type PerfilConfiguracion = "medico" | "admin";

export interface Usuario {
  id: string;
  nombre: string;
  rol: PerfilConfiguracion;
}

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
  { clave: "EDAD", etiqueta: "Edad", tipo: "number", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "paciente" },
  { clave: "SEXO", etiqueta: "Sexo", tipo: "enum", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "paciente" },
  // Clínico
  { clave: "ESPEC_ORIGEN", etiqueta: "Especialidad Origen", tipo: "string", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "clinico" },
  { clave: "ESPEC_DESTINO", etiqueta: "Especialidad Destino", tipo: "string", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "clinico" },
  { clave: "HISTORIA_CLINICA", etiqueta: "Historia Clínica", tipo: "string", obligatorioPorDefecto: true, exportablePorDefecto: false, grupo: "clinico" },
  { clave: "FUNDAMENTOS_DIAGNOSTICO", etiqueta: "Fundamentos Diagnóstico", tipo: "string", obligatorioPorDefecto: true, exportablePorDefecto: false, grupo: "clinico" },
  { clave: "EXAMENES_COMPLEMENTARIOS", etiqueta: "Exámenes Complementarios", tipo: "string", obligatorioPorDefecto: false, exportablePorDefecto: false, grupo: "clinico" },
  { clave: "MOTIVO_INTERCONSULTA", etiqueta: "Motivo Interconsulta", tipo: "string", obligatorioPorDefecto: true, exportablePorDefecto: true, grupo: "clinico" },
  // Priorización (del modelo IA / CSV original)
  { clave: "PRIORIDAD_ACTUAL", etiqueta: "Prioridad Actual", tipo: "enum", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "priorizacion" },
  { clave: "JUSTIFICACION_IA", etiqueta: "Justificación IA", tipo: "string", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "priorizacion" },
  // Metadatos del sistema
  { clave: "ID", etiqueta: "ID", tipo: "string", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "metadatos" },
  { clave: "ESTADO", etiqueta: "Estado", tipo: "enum", obligatorioPorDefecto: false, exportablePorDefecto: true, grupo: "metadatos" },
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
      "ESPEC_ORIGEN", "EDAD", "SEXO",
      "ESPEC_DESTINO", "HISTORIA_CLINICA", "FUNDAMENTOS_DIAGNOSTICO",
      "EXAMENES_COMPLEMENTARIOS", "MOTIVO_INTERCONSULTA",
      "PRIORIDAD_ACTUAL", "JUSTIFICACION_IA",
      "ID", "ESTADO", "FECHA_INGRESO", "FECHA_ACTUALIZACION"
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
export function getCampoPorClave(clave: string): DefinicionCampo | undefined {
  return TODOS_LOS_CAMPOS.find(c => c.clave === clave);
}

export function mergeConfigPerfil(config: ConfiguracionCampos, perfil: PerfilConfiguracion): ConfiguracionCampos {
  // Respetar siempre la configuración del usuario (incluye cambios guardados
  // en localStorage y toggles recientes). Solo devolvemos su config con el
  // perfil actualizado; no se sobreescriben los campos.
  return {
    ...config,
    perfil,
  };
}