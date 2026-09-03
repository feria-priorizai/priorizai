from pydantic import BaseModel, Field


class PriorizarInterconsultasRequest(BaseModel):
    ids: list[str] = Field(min_length=1)


class ProbabilidadesPrioridad(BaseModel):
    baja: float
    media: float
    alta: float


class ResultadoPriorizacion(BaseModel):
    id: str
    prioridad: str
    confianza: float
    probabilidades: ProbabilidadesPrioridad


class PriorizarInterconsultasResponse(BaseModel):
    total: int
    resultados: list[ResultadoPriorizacion]
