from datetime import datetime

from pydantic import BaseModel


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
