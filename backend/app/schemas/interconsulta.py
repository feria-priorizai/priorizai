from datetime import datetime

from pydantic import BaseModel, computed_field

from app.services.banderas_rojas import nombres_de_terminos


class ModificarPrioridadRequest(BaseModel):
    prioridad: str
    motivo: str
    medico_responsable: str


class ModificarEstadoRequest(BaseModel):
    estado: str


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
