from datetime import datetime

from pydantic import BaseModel


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

    model_config = {"from_attributes": True}
