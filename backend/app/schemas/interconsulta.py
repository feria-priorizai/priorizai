from datetime import datetime
from typing import Any

from pydantic import BaseModel, computed_field, field_validator

from app.schemas.explicacion import VERSION_EXPLICACION, ExplicacionShap
from app.services.banderas_rojas import nombres_de_terminos


class ModificarPrioridadRequest(BaseModel):
    """El medico responsable no viene aca: lo pone el backend desde la sesion."""

    prioridad: str
    motivo: str


class ModificarEstadoRequest(BaseModel):
    estado: str


class EntidadClinica(BaseModel):
    clase: str
    clase_original: str
    texto: str
    inicio: int
    fin: int
    score: float


class ModificacionPrioridadResponse(BaseModel):
    id: str
    prioridad_anterior: str | None
    prioridad_nueva: str
    motivo: str
    medico_responsable: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ReevaluarBanderasResponse(BaseModel):
    total_evaluadas: int
    total_con_bandera_roja: int


class InterconsultaResponse(BaseModel):
    id: str
    espec_origen: str
    edad: int
    sexo: str
    espec_destino: str
    prioridad_original_csv: str | None
    historia_clinica: str
    fundamentos_diagnostico: str
    examenes_complementarios: str | None
    motivo_interconsulta: str
    prioridad_sugerida_modelo: str | None
    confianza_modelo: float | None
    prob_baja: float | None
    prob_media: float | None
    prob_alta: float | None
    prioridad_actual: str | None
    entidades: dict[str, list[EntidadClinica]] | None = None
    entidades_error: str | None = None
    estado: str
    motivo_sin_prioridad: str | None
    fecha_emision: datetime | None
    bandera_roja: bool
    terminos_bandera_roja: str | None
    prioridad_forzada_por_regla: bool
    created_at: datetime
    updated_at: datetime
    modificaciones: list[ModificacionPrioridadResponse] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def terminos_bandera_roja_nombres(self) -> list[str]:
        """Los terminos de la bandera roja con su nombre clinico, para mostrarlos
        (HU5-c3). Se deriva del catalogo en vez de persistirse, para que editar un
        nombre en el YAML no obligue a migrar las filas ya guardadas."""
        return nombres_de_terminos(self.terminos_bandera_roja)

    model_config = {"from_attributes": True}


class InterconsultaDetalleResponse(InterconsultaResponse):
    """El detalle agrega la explicacion. No va en el listado, que trae cientos
    de interconsultas y no la muestra."""

    explicacion: ExplicacionShap | None = None

    @field_validator("explicacion", mode="before")
    @classmethod
    def _descartar_version_anterior(cls, valor: Any) -> Any:
        """Una explicacion guardada con otro formato se trata como inexistente:
        el frontend ofrece calcularla de nuevo en vez de fallar al leerla."""
        if isinstance(valor, dict) and valor.get("version") == VERSION_EXPLICACION:
            return valor
        return None
