from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.auth import ClinicoActual, UsuarioActual
from app.core.database import get_db
from app.models.interconsulta import Interconsulta
from app.models.modificacion_prioridad import ModificacionPrioridad
from app.models.usuario import Usuario
from app.schemas.interconsulta import (
    InterconsultaResponse,
    ModificarEstadoRequest,
    ModificarPrioridadRequest,
    ReevaluarBanderasResponse,
)
from app.schemas.priorizacion import (
    PriorizarInterconsultasRequest,
    PriorizarInterconsultasResponse,
    ResultadoPriorizacion,
)
from app.services.auth import ROL_MEDICO
from app.services.banderas_rojas import aplicar_banderas_a_interconsulta
from app.services.especialidades import (
    filtrar_por_especialidad_si_medico as _filtrar_por_especialidad_si_medico,
)
from app.services.priorizador import (
    PriorizadorRigoBerta,
    aplicar_resultado,
    get_priorizador,
    tiene_informacion_clinica,
)

router = APIRouter(
    prefix="/api/interconsultas",
    tags=["interconsultas"],
    dependencies=[UsuarioActual],
)

LIMITE_LISTADO = 100

MOTIVO_MINIMO = 10
DbSession = Depends(get_db)
PriorizadorDependency = Depends(get_priorizador)

_PRIORIDAD_EFECTIVA = func.lower(
    func.coalesce(
        func.nullif(func.trim(Interconsulta.prioridad_actual), ""),
        func.nullif(func.trim(Interconsulta.prioridad_sugerida_modelo), ""),
    )
)

_ORDEN_PRIORIDAD = case(
    (_PRIORIDAD_EFECTIVA == "alta", 0),
    (_PRIORIDAD_EFECTIVA == "media", 1),
    (_PRIORIDAD_EFECTIVA == "baja", 2),
    else_=3,
)


@router.get("", response_model=list[InterconsultaResponse])
def listar_interconsultas(
    response: Response,
    limit: int = Query(default=LIMITE_LISTADO, ge=1, le=500),
    offset: int = 0,
    db: Session = DbSession,
    usuario: Usuario = UsuarioActual,
) -> list[Interconsulta]:
    """El total va en la cabecera `X-Total-Count`: sin el, el cliente no puede
    distinguir 'no hay mas' de 'la pagina se lleno' y termina mostrando como total
    lo que entro en la primera pagina.

    Para medicos: filtra por espec_destino == especialidad del usuario.
    Para administradores: muestra todas las interconsultas.
    """
    base_query = select(func.count()).select_from(Interconsulta)
    base_query = _filtrar_por_especialidad_si_medico(base_query, usuario)
    total = db.scalar(base_query) or 0
    response.headers["X-Total-Count"] = str(total)

    stmt = (
        select(Interconsulta)
        .options(selectinload(Interconsulta.modificaciones))
        .order_by(
            _ORDEN_PRIORIDAD,
            func.coalesce(Interconsulta.fecha_emision, Interconsulta.created_at).asc(),
            Interconsulta.id.asc(),
        )
        .offset(offset)
        .limit(limit)
    )
    stmt = _filtrar_por_especialidad_si_medico(stmt, usuario)
    return list(db.scalars(stmt).all())


@router.get("/{interconsulta_id}", response_model=InterconsultaResponse)
def obtener_interconsulta(
    interconsulta_id: str,
    db: Session = DbSession,
    usuario: Usuario = UsuarioActual,
) -> Interconsulta:
    stmt = (
        select(Interconsulta)
        .options(selectinload(Interconsulta.modificaciones))
        .where(Interconsulta.id == interconsulta_id)
    )
    stmt = _filtrar_por_especialidad_si_medico(stmt, usuario)
    interconsulta: Interconsulta | None = db.scalar(stmt)
    if interconsulta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interconsulta no encontrada",
        )
    return interconsulta


@router.patch("/{interconsulta_id}/prioridad", response_model=InterconsultaResponse)
def modificar_prioridad_interconsulta(
    interconsulta_id: str,
    payload: ModificarPrioridadRequest,
    db: Session = DbSession,
    usuario: Usuario = ClinicoActual,
) -> Interconsulta:
    nueva_prioridad = _normalizar_prioridad(payload.prioridad)
    motivo = payload.motivo.strip()
    if not motivo:
        raise HTTPException(
            status_code=422,
            detail="El motivo de modificacion es obligatorio",
        )
    if len(motivo) < MOTIVO_MINIMO:
        raise HTTPException(
            status_code=422,
            detail=(
                "El motivo de modificacion debe tener al menos "
                f"{MOTIVO_MINIMO} caracteres"
            ),
        )
    stmt = (
        select(Interconsulta)
        .options(selectinload(Interconsulta.modificaciones))
        .where(Interconsulta.id == interconsulta_id)
    )
    stmt = _filtrar_por_especialidad_si_medico(stmt, usuario)
    interconsulta = db.scalar(stmt)
    if interconsulta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interconsulta no encontrada",
        )

    prioridad_anterior = interconsulta.prioridad_actual
    interconsulta.prioridad_actual = nueva_prioridad
    interconsulta.prioridad_forzada_por_regla = False
    db.add(
        ModificacionPrioridad(
            interconsulta_id=interconsulta.id,
            prioridad_anterior=prioridad_anterior,
            prioridad_nueva=nueva_prioridad,
            motivo=motivo,
            medico_responsable=usuario.nombre,
        )
    )
    db.commit()
    actualizada = db.scalar(
        select(Interconsulta)
        .options(selectinload(Interconsulta.modificaciones))
        .where(Interconsulta.id == interconsulta_id)
    )
    assert actualizada is not None
    return actualizada


@router.patch("/{interconsulta_id}/estado", response_model=InterconsultaResponse)
def modificar_estado_interconsulta(
    interconsulta_id: str,
    payload: ModificarEstadoRequest,
    db: Session = DbSession,
    usuario: Usuario = ClinicoActual,
) -> Interconsulta:
    nuevo_estado = _normalizar_estado(payload.estado)
    stmt = (
        select(Interconsulta)
        .options(selectinload(Interconsulta.modificaciones))
        .where(Interconsulta.id == interconsulta_id)
    )
    stmt = _filtrar_por_especialidad_si_medico(stmt, usuario)
    interconsulta = db.scalar(stmt)
    if interconsulta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interconsulta no encontrada",
        )

    interconsulta.estado = nuevo_estado
    db.commit()
    actualizada = db.scalar(
        select(Interconsulta)
        .options(selectinload(Interconsulta.modificaciones))
        .where(Interconsulta.id == interconsulta_id)
    )
    assert actualizada is not None
    return actualizada


@router.post("/reevaluar-banderas", response_model=ReevaluarBanderasResponse)
def reevaluar_banderas_rojas(
    db: Session = DbSession,
) -> ReevaluarBanderasResponse:
    """Re-evalua las banderas rojas de todas las interconsultas (RF7 / D6): util
    tras editar el catalogo de terminos de alarma, ya que las interconsultas
    cargadas antes del cambio no se reevaluan solas."""
    interconsultas = list(db.scalars(select(Interconsulta)).all())

    ids_con_modificacion = _ids_con_modificacion_previa(
        db, [interconsulta.id for interconsulta in interconsultas]
    )

    total_con_bandera = 0
    for interconsulta in interconsultas:
        resultado = aplicar_banderas_a_interconsulta(
            interconsulta,
            ya_modificada_por_medico=interconsulta.id in ids_con_modificacion,
        )
        if resultado.bandera_roja:
            total_con_bandera += 1

    db.commit()
    return ReevaluarBanderasResponse(
        total_evaluadas=len(interconsultas),
        total_con_bandera_roja=total_con_bandera,
    )


def _ids_con_modificacion_previa(db: Session, ids: list[str]) -> set[str]:
    if not ids:
        return set()
    stmt = select(ModificacionPrioridad.interconsulta_id).where(
        ModificacionPrioridad.interconsulta_id.in_(ids)
    )
    return set(db.scalars(stmt).all())


@router.post("/priorizar", response_model=PriorizarInterconsultasResponse)
def priorizar_interconsultas(
    payload: PriorizarInterconsultasRequest,
    db: Session = DbSession,
    priorizador: PriorizadorRigoBerta = PriorizadorDependency,
    usuario: Usuario = UsuarioActual,
) -> PriorizarInterconsultasResponse:
    # Retrieve requested interconsultas
    interconsultas = _buscar_interconsultas(db, payload.ids)
    # Apply specialty filter for doctors
    if usuario.rol == ROL_MEDICO:
        # Build a query to find allowed IDs
        stmt = select(Interconsulta.id).where(Interconsulta.id.in_(payload.ids))
        stmt = _filtrar_por_especialidad_si_medico(stmt, usuario)
        allowed_ids = {row for row in db.scalars(stmt)}
        # Verify all requested interconsultas are allowed
        disallowed = [ic.id for ic in interconsultas if ic.id not in allowed_ids]
        if disallowed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"interconsultas_no_permitidas": disallowed},
            )
    _validar_interconsultas_para_prediccion(interconsultas)
    resultados = _predecir_o_503(priorizador, interconsultas)
    _guardar_resultados(db, interconsultas, resultados)
    return PriorizarInterconsultasResponse(
        total=len(resultados),
        resultados=resultados,
    )


@router.post("/priorizar-pendientes", response_model=PriorizarInterconsultasResponse)
def priorizar_interconsultas_pendientes(
    limit: int = Query(default=25, ge=1, le=500),
    db: Session = DbSession,
    priorizador: PriorizadorRigoBerta = PriorizadorDependency,
) -> PriorizarInterconsultasResponse:
    stmt = (
        select(Interconsulta)
        .where(Interconsulta.prioridad_sugerida_modelo.is_(None))
        .where(_condicion_con_informacion_clinica())
        .order_by(Interconsulta.created_at.desc())
        .limit(limit)
    )
    interconsultas = list(db.scalars(stmt).all())
    resultados = _predecir_o_503(priorizador, interconsultas)
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


def _normalizar_prioridad(prioridad: str) -> str:
    prioridad_normalizada = prioridad.strip().lower()
    if prioridad_normalizada not in {"alta", "media", "baja"}:
        raise HTTPException(
            status_code=422,
            detail="La prioridad debe ser alta, media o baja",
        )
    return prioridad_normalizada


def _normalizar_estado(estado: str) -> str:
    estado_normalizado = estado.strip().lower()
    if estado_normalizado not in {"pendiente", "revisada"}:
        raise HTTPException(
            status_code=422,
            detail="El estado debe ser pendiente o revisada",
        )
    return estado_normalizado


def _validar_interconsultas_para_prediccion(
    interconsultas: list[Interconsulta],
) -> None:
    invalidas = [
        interconsulta.id
        for interconsulta in interconsultas
        if not tiene_informacion_clinica(interconsulta)
    ]
    if invalidas:
        raise HTTPException(
            status_code=422,
            detail={
                "message": (
                    "No se puede realizar una prediccion de prioridad porque "
                    "la interconsulta no contiene informacion clinica suficiente"
                ),
                "interconsultas_invalidas": invalidas,
            },
        )


def _condicion_con_informacion_clinica():
    return or_(
        func.length(func.trim(Interconsulta.historia_clinica)) > 0,
        func.length(func.trim(Interconsulta.fundamentos_diagnostico)) > 0,
        func.length(func.trim(Interconsulta.examenes_complementarios)) > 0,
        func.length(func.trim(Interconsulta.motivo_interconsulta)) > 0,
    )


def _predecir_o_503(
    priorizador: PriorizadorRigoBerta,
    interconsultas: list[Interconsulta],
) -> list[ResultadoPriorizacion]:
    try:
        return priorizador.predecir(interconsultas)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"No se pudo ejecutar el modelo predictivo: {exc}",
        ) from exc


def _guardar_resultados(
    db: Session,
    interconsultas: list[Interconsulta],
    resultados: list[ResultadoPriorizacion],
) -> None:
    por_id = {interconsulta.id: interconsulta for interconsulta in interconsultas}
    for resultado in resultados:
        aplicar_resultado(por_id[resultado.id], resultado)
    db.commit()
