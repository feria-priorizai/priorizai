import logging
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload, sessionmaker

from app.api.auth import ClinicoActual, UsuarioActual
from app.core.database import get_db
from app.models.interconsulta import Interconsulta
from app.models.modificacion_prioridad import ModificacionPrioridad
from app.models.usuario import Usuario
from app.schemas.explicacion import VERSION_EXPLICACION, EstadoExplicacion
from app.schemas.interconsulta import (
    InterconsultaDetalleResponse,
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
from app.services import explicabilidad
from app.services.banderas_rojas import aplicar_banderas_a_interconsulta
from app.services.cola_explicaciones import ColaExplicaciones, get_cola
from app.services.priorizador import (
    PriorizadorRigoBerta,
    aplicar_resultado,
    get_priorizador,
    tiene_informacion_clinica,
)

logger = logging.getLogger(__name__)

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
) -> list[Interconsulta]:
    """El total va en la cabecera `X-Total-Count`: sin el, el cliente no puede
    distinguir 'no hay mas' de 'la pagina se lleno' y termina mostrando como total
    lo que entro en la primera pagina."""
    total = db.scalar(select(func.count()).select_from(Interconsulta)) or 0
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
    return list(db.scalars(stmt).all())


@router.get("/{interconsulta_id}", response_model=InterconsultaDetalleResponse)
def obtener_interconsulta(
    interconsulta_id: str,
    db: Session = DbSession,
) -> Interconsulta:
    interconsulta = db.scalar(
        select(Interconsulta)
        .options(selectinload(Interconsulta.modificaciones))
        .where(Interconsulta.id == interconsulta_id)
    )
    if interconsulta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interconsulta no encontrada",
        )
    return interconsulta


def _explicacion_vigente(interconsulta: Interconsulta) -> dict[str, Any] | None:
    """La explicacion guardada, si todavia corresponde a la sugerencia actual.

    Queda vieja si cambio su formato o si la interconsulta se volvio a
    priorizar con otro resultado (por ejemplo, tras corregir MODEL_LABELS):
    explicaria una prioridad que el modelo ya no sugiere.
    """
    guardada = interconsulta.explicacion
    if not isinstance(guardada, dict) or guardada.get("version") != VERSION_EXPLICACION:
        return None
    sugerida = interconsulta.prioridad_sugerida_modelo
    if sugerida is not None and guardada.get("clase") != sugerida:
        return None
    return guardada


ColaDependency = Depends(get_cola)


def _buscar_o_404(db: Session, interconsulta_id: str) -> Interconsulta:
    interconsulta = db.get(Interconsulta, interconsulta_id)
    if interconsulta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interconsulta no encontrada",
        )
    return interconsulta


def _guardar_explicacion(
    db: Session, interconsulta_id: str
) -> Callable[[dict[str, Any]], None]:
    """Callback para la cola. Abre su propia sesion porque corre en otro hilo,
    cuando la de esta peticion ya se cerro."""
    fabrica = sessionmaker(bind=db.get_bind(), autoflush=False)

    def guardar(resultado: dict[str, Any]) -> None:
        with fabrica() as sesion:
            interconsulta = sesion.get(Interconsulta, interconsulta_id)
            if interconsulta is None:
                return
            interconsulta.explicacion = resultado
            sesion.commit()

    return guardar


# Las de prioridad alta se explican primero: son las que el medico revisa antes.
_ORDEN_EXPLICACION = {"alta": 0, "media": 1, "baja": 2}


def encolar_explicaciones(
    db: Session,
    interconsultas: list[Interconsulta],
    priorizador: Any,
    cola: ColaExplicaciones,
) -> int:
    """Encola la explicacion de cada interconsulta recien priorizada, en el
    mismo momento en que se prioriza: el medico la encuentra lista, o en
    camino, al abrir el detalle, sin tener que pedirla.

    La prediccion no espera a la explicacion. Priorizar toma segundos y
    explicar minutos por interconsulta, asi que la explicacion corre despues,
    en la cola, de a una. Sin el modelo en el proceso (MODEL_SERVICE_URL) no
    hay como explicar y no se encola nada; la carga sigue igual. Las que ya
    tienen una explicacion vigente no se recalculan.
    """
    if not explicabilidad.modelo_disponible(priorizador):
        return 0
    pendientes = [
        interconsulta
        for interconsulta in interconsultas
        if interconsulta.prioridad_sugerida_modelo is not None
        and tiene_informacion_clinica(interconsulta)
        and _explicacion_vigente(interconsulta) is None
    ]
    pendientes.sort(
        key=lambda ic: _ORDEN_EXPLICACION.get(ic.prioridad_sugerida_modelo or "", 3)
    )
    for interconsulta in pendientes:
        cola.encolar(
            interconsulta.id,
            explicabilidad.valores_de_interconsulta(interconsulta),
            priorizador,
            _guardar_explicacion(db, interconsulta.id),
        )
    return len(pendientes)


def _estado_explicacion(
    db: Session, interconsulta_id: str, cola: ColaExplicaciones
) -> dict[str, Any]:
    """El orden importa: primero la cola, despues la base. La cola guarda el
    resultado en la base y recien entonces olvida el trabajo, asi que si ya no
    lo tiene, la base si. Al reves, un calculo que termina entre las dos
    lecturas no aparece en ninguna y la pagina deja de preguntar.
    """
    trabajo = cola.estado(interconsulta_id)
    interconsulta = _buscar_o_404(db, interconsulta_id)
    if trabajo is not None:
        return trabajo
    if (vigente := _explicacion_vigente(interconsulta)) is not None:
        return {"estado": "lista", "resultado": vigente}
    return {"estado": "sin_explicacion"}


@router.post(
    "/{interconsulta_id}/explicacion",
    response_model=EstadoExplicacion,
    status_code=status.HTTP_202_ACCEPTED,
    responses={200: {"description": "La explicacion ya estaba lista"}},
)
def explicar_interconsulta(
    interconsulta_id: str,
    response: Response,
    forzar: bool = Query(
        default=False,
        description="Recalcula aunque haya una explicacion guardada vigente",
    ),
    db: Session = DbSession,
    priorizador: PriorizadorRigoBerta = PriorizadorDependency,
    cola: ColaExplicaciones = ColaDependency,
) -> dict[str, Any]:
    """Pide la explicacion de por que el modelo sugiere la prioridad que
    sugiere: cuanto aporto cada campo, con SHAP.

    Tarda minutos, asi que no se calcula aca: se encola, se responde 202 y el
    avance se consulta con GET. Si ya hay una guardada y vigente, responde 200.
    """
    interconsulta = _buscar_o_404(db, interconsulta_id)
    if not tiene_informacion_clinica(interconsulta):
        raise HTTPException(
            status_code=422,
            detail="La interconsulta no tiene texto clínico que explicar",
        )
    if not explicabilidad.modelo_disponible(priorizador):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "La explicación necesita el modelo cargado en el backend. Con "
                "MODEL_SERVICE_URL las predicciones vienen del servicio externo, "
                "que todavía no expone explicaciones."
            ),
        )

    if _explicacion_vigente(interconsulta) is not None and not forzar:
        response.status_code = status.HTTP_200_OK
    else:
        cola.encolar(
            interconsulta_id,
            explicabilidad.valores_de_interconsulta(interconsulta),
            priorizador,
            _guardar_explicacion(db, interconsulta_id),
        )
    return _estado_explicacion(db, interconsulta_id, cola)


@router.get("/{interconsulta_id}/explicacion", response_model=EstadoExplicacion)
def estado_explicacion(
    interconsulta_id: str,
    db: Session = DbSession,
    cola: ColaExplicaciones = ColaDependency,
) -> dict[str, Any]:
    """En que va la explicacion: en cola, calculando (con su avance), lista,
    con error o inexistente."""
    return _estado_explicacion(db, interconsulta_id, cola)


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
    interconsulta = db.scalar(
        select(Interconsulta)
        .options(selectinload(Interconsulta.modificaciones))
        .where(Interconsulta.id == interconsulta_id)
    )
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
) -> Interconsulta:
    nuevo_estado = _normalizar_estado(payload.estado)
    interconsulta = db.scalar(
        select(Interconsulta)
        .options(selectinload(Interconsulta.modificaciones))
        .where(Interconsulta.id == interconsulta_id)
    )
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
    cola: ColaExplicaciones = ColaDependency,
) -> PriorizarInterconsultasResponse:
    interconsultas = _buscar_interconsultas(db, payload.ids)
    _validar_interconsultas_para_prediccion(interconsultas)
    resultados = _predecir_o_503(priorizador, interconsultas)
    _guardar_resultados(db, interconsultas, resultados)
    encolar_explicaciones(db, interconsultas, priorizador, cola)
    return PriorizarInterconsultasResponse(
        total=len(resultados),
        resultados=resultados,
    )


@router.post("/priorizar-pendientes", response_model=PriorizarInterconsultasResponse)
def priorizar_interconsultas_pendientes(
    limit: int = Query(default=25, ge=1, le=500),
    db: Session = DbSession,
    priorizador: PriorizadorRigoBerta = PriorizadorDependency,
    cola: ColaExplicaciones = ColaDependency,
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
    encolar_explicaciones(db, interconsultas, priorizador, cola)
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
