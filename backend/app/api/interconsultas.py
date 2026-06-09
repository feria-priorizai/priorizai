from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.interconsulta import Interconsulta
from app.schemas.priorizacion import (
    PriorizarInterconsultasRequest,
    PriorizarInterconsultasResponse,
    ResultadoPriorizacion,
)
from app.services.priorizador import PriorizadorRigoBerta, get_priorizador

router = APIRouter(prefix="/api/interconsultas", tags=["interconsultas"])
DbSession = Depends(get_db)
PriorizadorDependency = Depends(get_priorizador)


@router.post("/priorizar", response_model=PriorizarInterconsultasResponse)
def priorizar_interconsultas(
    payload: PriorizarInterconsultasRequest,
    db: Session = DbSession,
    priorizador: PriorizadorRigoBerta = PriorizadorDependency,
) -> PriorizarInterconsultasResponse:
    interconsultas = _buscar_interconsultas(db, payload.ids)
    try:
        resultados = priorizador.predecir(interconsultas)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"No se pudo ejecutar el modelo predictivo: {exc}",
        ) from exc

    _guardar_resultados(db, interconsultas, resultados)
    return PriorizarInterconsultasResponse(
        total=len(resultados),
        resultados=resultados,
    )


def _buscar_interconsultas(db: Session, ids: list[str]) -> list[Interconsulta]:
    stmt = select(Interconsulta).where(Interconsulta.id.in_(ids))
    interconsultas = list(db.scalars(stmt).all())
    encontrados = {interconsulta.id for interconsulta in interconsultas}
    faltantes = [id_ for id_ in ids if id_ not in encontrados]

    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"interconsultas_no_encontradas": faltantes},
        )
    return interconsultas


def _guardar_resultados(
    db: Session,
    interconsultas: list[Interconsulta],
    resultados: list[ResultadoPriorizacion],
) -> None:
    por_id = {interconsulta.id: interconsulta for interconsulta in interconsultas}
    for resultado in resultados:
        interconsulta = por_id[resultado.id]
        interconsulta.prioridad_sugerida_modelo = resultado.prioridad
        interconsulta.confianza_modelo = resultado.confianza
        interconsulta.prob_baja = resultado.probabilidades.baja
        interconsulta.prob_media = resultado.probabilidades.media
        interconsulta.prob_alta = resultado.probabilidades.alta
        interconsulta.prioridad_actual = resultado.prioridad
    db.commit()
