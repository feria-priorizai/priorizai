from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.services.reentrenamiento import MAXIMO_CONFIGURACIONES, PARAMETROS_POR_DEFECTO


class ParametrosEntrenamiento(BaseModel):
    epocas: int = Field(default=PARAMETROS_POR_DEFECTO["epocas"], ge=1, le=30)
    learning_rate: float = Field(
        default=PARAMETROS_POR_DEFECTO["learning_rate"], gt=0, le=1e-3
    )
    batch_size: int = Field(default=PARAMETROS_POR_DEFECTO["batch_size"], ge=1, le=128)
    max_length: int = Field(default=PARAMETROS_POR_DEFECTO["max_length"], ge=32, le=512)
    paciencia: int = Field(default=PARAMETROS_POR_DEFECTO["paciencia"], ge=1, le=10)


class IniciarReentrenamientoRequest(BaseModel):
    dispositivo: Literal["cpu", "gpu"]
    # "El sistema elige por ti": ignora `configuraciones` y entrena una sola
    # con los valores por defecto.
    automatico: bool = False
    porcentaje_evaluacion: int = Field(default=20, ge=10, le=40)
    configuraciones: list[ParametrosEntrenamiento] = Field(
        default_factory=list, max_length=MAXIMO_CONFIGURACIONES
    )
    # Fuentes de datos: las interconsultas revisadas en la app y/o archivos
    # subidos con interconsultas ya priorizadas.
    usar_revisadas: bool = True
    archivos: list[str] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def _al_menos_una(self) -> "IniciarReentrenamientoRequest":
        if not self.automatico and not self.configuraciones:
            raise ValueError(
                "Agrega al menos una configuración o usa «el sistema elige por ti»."
            )
        return self


class ResumenReentrenamientoResponse(BaseModel):
    # Las interconsultas revisadas en la app. puede_iniciar y motivo_bloqueo
    # miran solo esa fuente; bloqueo_general es lo que impide reentrenar con
    # cualquier fuente (servicio remoto, uno en curso).
    registros_disponibles: int
    registros_por_clase: dict[str, int]
    minimo: int
    minimo_por_clase: int
    puede_iniciar: bool
    motivo_bloqueo: str | None
    bloqueo_general: str | None
    gpu_disponible: bool
    servicio_remoto: bool
    modelo_base: str
    en_curso_id: str | None
    maximo_configuraciones: int
    parametros_por_defecto: ParametrosEntrenamiento


class ArchivoEntrenamientoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    nombre: str
    n_registros: int
    registros_por_clase: dict[str, int]
    n_rechazadas: int
    creado_por: str
    created_at: datetime


class FilaRechazada(BaseModel):
    fila: int
    motivo: str


class SubidaArchivoResponse(BaseModel):
    archivo: ArchivoEntrenamientoResponse
    # Solo las primeras; n_rechazadas del archivo dice cuantas fueron.
    rechazadas: list[FilaRechazada]


class ReentrenamientoItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    estado: str
    dispositivo: str
    automatico: bool
    configuraciones: list[dict[str, Any]]
    porcentaje_evaluacion: int
    n_registros: int
    registros_por_clase: dict[str, int]
    n_evaluacion: int
    version_base_id: str | None
    progreso: dict[str, Any] | None
    error: str | None
    resultados: dict[str, Any] | None
    iniciado_por: str
    created_at: datetime
    terminado_en: datetime | None


class ReentrenamientoResponse(ReentrenamientoItemResponse):
    log: str


class VersionModeloResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    nombre: str
    ruta: str
    origen: str
    labels: list[str]
    metricas: dict[str, Any] | None
    parametros: dict[str, Any] | None
    n_registros: int | None
    reentrenamiento_id: str | None
    activa: bool
    creado_por: str | None
    created_at: datetime
    disponible: bool = True
    # Carpeta donde quedo guardado, como la ve quien instalo la app.
    carpeta: str = ""


class CambioModeloResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    version_id: str
    version_anterior_id: str | None
    accion: str
    usuario: str
    created_at: datetime
