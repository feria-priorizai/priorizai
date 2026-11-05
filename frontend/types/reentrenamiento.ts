/**
 * Tipos del módulo de reentrenamiento. Reflejan app/schemas/reentrenamiento.py
 * del backend.
 */

export type Dispositivo = "cpu" | "gpu";
export type EstadoReentrenamiento = "en_curso" | "terminado" | "error" | "cancelado";
export type OrigenVersion = "inicial" | "reentrenamiento" | "subido";

export interface ParametrosEntrenamiento {
  epocas: number;
  learning_rate: number;
  batch_size: number;
  max_length: number;
  paciencia: number;
}

export interface Metricas {
  n: number;
  exactitud: number;
  f1_macro: number;
  sensibilidad_alta: number;
  f1_por_clase: Record<string, number>;
  matriz_confusion: number[][];
}

export interface ResumenReentrenamiento {
  registros_disponibles: number;
  registros_por_clase: Record<string, number>;
  minimo: number;
  minimo_por_clase: number;
  /** Solo con las interconsultas revisadas en la app. */
  puede_iniciar: boolean;
  motivo_bloqueo: string | null;
  /** Lo que impide reentrenar con cualquier fuente (servicio remoto, uno en curso). */
  bloqueo_general: string | null;
  gpu_disponible: boolean;
  servicio_remoto: boolean;
  modelo_base: string;
  en_curso_id: string | null;
  maximo_configuraciones: number;
  parametros_por_defecto: ParametrosEntrenamiento;
}

export interface Progreso {
  etapa?: string;
  porcentaje?: number;
  segundos_transcurridos?: number;
  segundos_restantes?: number | null;
  configuracion?: number;
  configuraciones?: number;
  epoca?: number;
  epocas?: number;
}

export interface ResultadoConfiguracion {
  indice: number;
  version_id: string;
  parametros: ParametrosEntrenamiento;
  metricas: Metricas | null;
  mejor_epoca: number | null;
  epocas_corridas: number | null;
}

export interface Reentrenamiento {
  id: string;
  estado: EstadoReentrenamiento;
  dispositivo: Dispositivo;
  automatico: boolean;
  configuraciones: ParametrosEntrenamiento[];
  porcentaje_evaluacion: number;
  n_registros: number;
  registros_por_clase: Record<string, number>;
  n_evaluacion: number;
  version_base_id: string | null;
  progreso: Progreso | null;
  error: string | null;
  resultados: {
    modelo_actual: Metricas | null;
    configuraciones: ResultadoConfiguracion[];
  } | null;
  iniciado_por: string;
  created_at: string;
  terminado_en: string | null;
  log?: string;
}

export interface VersionModelo {
  id: string;
  nombre: string;
  ruta: string;
  origen: OrigenVersion;
  labels: string[];
  metricas: Metricas | null;
  parametros: Record<string, unknown> | null;
  n_registros: number | null;
  reentrenamiento_id: string | null;
  activa: boolean;
  creado_por: string | null;
  created_at: string;
  disponible: boolean;
  /** Carpeta donde quedó guardado, como la ve quien instaló la app. */
  carpeta: string;
}

export interface CambioModelo {
  id: string;
  version_id: string;
  version_anterior_id: string | null;
  accion: "activar" | "revertir";
  usuario: string;
  created_at: string;
}

export interface SolicitudReentrenamiento {
  dispositivo: Dispositivo;
  automatico: boolean;
  porcentaje_evaluacion: number;
  configuraciones: ParametrosEntrenamiento[];
  usar_revisadas: boolean;
  /** Ids de archivos subidos con interconsultas ya priorizadas. */
  archivos: string[];
}

/** Archivo con interconsultas ya priorizadas, guardado en el servidor. */
export interface ArchivoEntrenamiento {
  id: string;
  nombre: string;
  n_registros: number;
  registros_por_clase: Record<string, number>;
  n_rechazadas: number;
  creado_por: string;
  created_at: string;
}

export interface SubidaArchivo {
  archivo: ArchivoEntrenamiento;
  /** Solo las primeras filas rechazadas; el total está en archivo.n_rechazadas. */
  rechazadas: { fila: number; motivo: string }[];
}
