"""Modulo de reentrenamiento. Solo administradores: un medico no ve la opcion
en el menu y, si entra por la URL, la API igual le responde 403."""

import os
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.api.auth import AdministradorActual
from app.core import auditoria
from app.core.config import settings
from app.core.database import get_db
from app.models.reentrenamiento import (
    ArchivoEntrenamiento,
    CambioModelo,
    Reentrenamiento,
    VersionModelo,
)
from app.models.usuario import Usuario
from app.schemas.reentrenamiento import (
    ArchivoEntrenamientoResponse,
    CambioModeloResponse,
    FilaRechazada,
    IniciarReentrenamientoRequest,
    ParametrosEntrenamiento,
    ReentrenamientoItemResponse,
    ReentrenamientoResponse,
    ResumenReentrenamientoResponse,
    SubidaArchivoResponse,
    VersionModeloResponse,
)
from app.services import reentrenamiento as servicio
from app.services.cliente_modelos import usar_servicio_remoto
from app.services.datos_entrenamiento import ArchivoDatosInvalidoError, leer_archivo
from app.services.reentrenamiento import (
    MAXIMO_CONFIGURACIONES,
    MINIMO_POR_CLASE,
    ConflictoError,
    DatosInsuficientesError,
    ModeloInvalidoError,
    PriorizadorIntercambiable,
    Reentrenador,
    get_priorizador_local,
    get_reentrenador,
)

router = APIRouter(
    prefix="/api/reentrenamiento",
    tags=["reentrenamiento"],
    dependencies=[AdministradorActual],
)

DbSession = Depends(get_db)
ReentrenadorDependency = Depends(get_reentrenador)
PriorizadorLocal = Depends(get_priorizador_local)
ARCHIVO_MODELO = File(...)
ARCHIVO_DATOS = File(...)
NOMBRE_VERSION = Form(None)
ORDEN_CLASES = Form(None)
TAMANO_BLOQUE = 1024 * 1024

MENSAJE_SERVICIO_REMOTO = (
    "La app usa un servicio de modelos externo (MODEL_SERVICE_URL): los modelos "
    "se cambian en ese servicio, no desde aquí."
)


def _error_http(error: Exception) -> HTTPException:
    if isinstance(error, ConflictoError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


def _rechazar_si_remoto() -> None:
    if usar_servicio_remoto():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=MENSAJE_SERVICIO_REMOTO
        )


def _buscar_version(db: Session, version_id: str) -> VersionModelo:
    version = db.get(VersionModelo, version_id)
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Versión no encontrada"
        )
    return version


@router.get("/resumen", response_model=ResumenReentrenamientoResponse)
def resumen(
    db: Session = DbSession,
    reentrenador: Reentrenador = ReentrenadorDependency,
) -> ResumenReentrenamientoResponse:
    por_clase = servicio.contar_disponibles(db)
    remoto = usar_servicio_remoto()
    en_curso = reentrenador.en_curso() or db.scalar(
        select(Reentrenamiento.id).where(Reentrenamiento.estado == "en_curso")
    )
    bloqueo_general = None
    if remoto:
        bloqueo_general = MENSAJE_SERVICIO_REMOTO
    elif en_curso:
        bloqueo_general = "Ya hay un reentrenamiento en curso."
    motivo = bloqueo_general or servicio.motivo_bloqueo(
        por_clase, settings.reentrenamiento_minimo
    )
    return ResumenReentrenamientoResponse(
        registros_disponibles=sum(por_clase.values()),
        registros_por_clase=por_clase,
        minimo=settings.reentrenamiento_minimo,
        minimo_por_clase=MINIMO_POR_CLASE,
        puede_iniciar=motivo is None,
        motivo_bloqueo=motivo,
        bloqueo_general=bloqueo_general,
        gpu_disponible=servicio.gpu_disponible(),
        servicio_remoto=remoto,
        modelo_base=settings.reentrenamiento_modelo_base,
        en_curso_id=en_curso,
        maximo_configuraciones=MAXIMO_CONFIGURACIONES,
        parametros_por_defecto=ParametrosEntrenamiento(),
    )


# ---------------------------------------------------------------- trabajos --
@router.get("/trabajos", response_model=list[ReentrenamientoItemResponse])
def listar_reentrenamientos(db: Session = DbSession) -> list[Reentrenamiento]:
    return list(
        db.scalars(
            select(Reentrenamiento).order_by(Reentrenamiento.created_at.desc())
        ).all()
    )


@router.post(
    "/trabajos",
    response_model=ReentrenamientoResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def iniciar_reentrenamiento(
    payload: IniciarReentrenamientoRequest,
    request: Request,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
    reentrenador: Reentrenador = ReentrenadorDependency,
) -> Reentrenamiento:
    _rechazar_si_remoto()
    try:
        registro = reentrenador.iniciar(
            db,
            admin,
            dispositivo=payload.dispositivo,
            automatico=payload.automatico,
            porcentaje_evaluacion=payload.porcentaje_evaluacion,
            configuraciones=[c.model_dump() for c in payload.configuraciones],
            usar_revisadas=payload.usar_revisadas,
            archivos_ids=payload.archivos,
        )
    except (ConflictoError, DatosInsuficientesError) as error:
        raise _error_http(error) from None
    auditoria.registrar(
        "reentrenamiento_iniciado",
        request,
        id=registro.id,
        dispositivo=registro.dispositivo,
        configuraciones=len(registro.configuraciones),
        registros=registro.n_registros,
        revisadas=payload.usar_revisadas,
        archivos=",".join(payload.archivos),
        por=admin.alias,
    )
    return registro


@router.get("/trabajos/{reentrenamiento_id}", response_model=ReentrenamientoResponse)
def obtener_reentrenamiento(
    reentrenamiento_id: str, db: Session = DbSession
) -> Reentrenamiento:
    registro = db.get(Reentrenamiento, reentrenamiento_id)
    if registro is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reentrenamiento no encontrado",
        )
    return registro


@router.post(
    "/trabajos/{reentrenamiento_id}/cancelar",
    status_code=status.HTTP_202_ACCEPTED,
)
def cancelar_reentrenamiento(
    reentrenamiento_id: str,
    request: Request,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
    reentrenador: Reentrenador = ReentrenadorDependency,
) -> dict[str, str]:
    try:
        reentrenador.cancelar(db, reentrenamiento_id, admin)
    except ConflictoError as error:
        raise _error_http(error) from None
    auditoria.registrar(
        "reentrenamiento_cancelado", request, id=reentrenamiento_id, por=admin.alias
    )
    return {"status": "cancelando"}


# ---------------------------------------------------------------- archivos --
@router.get("/datos", response_model=list[ArchivoEntrenamientoResponse])
def listar_archivos(db: Session = DbSession) -> list[ArchivoEntrenamiento]:
    return list(
        db.scalars(
            select(ArchivoEntrenamiento).order_by(
                ArchivoEntrenamiento.created_at.desc()
            )
        ).all()
    )


@router.post(
    "/datos",
    response_model=SubidaArchivoResponse,
    status_code=status.HTTP_201_CREATED,
)
def subir_archivo(
    request: Request,
    archivo: UploadFile = ARCHIVO_DATOS,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
) -> SubidaArchivoResponse:
    """Recibe interconsultas ya priorizadas (.csv, .xlsx o .json) para usarlas
    al reentrenar, ademas de las revisadas en la app."""
    maximo = settings.datos_subidos_max_mb * 1024 * 1024
    contenido = archivo.file.read(maximo + 1)
    if len(contenido) > maximo:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"El archivo supera el máximo de {settings.datos_subidos_max_mb} MB.",
        )
    nombre = archivo.filename or "datos"
    try:
        datos = leer_archivo(nombre, contenido)
        registro = servicio.guardar_archivo(db, nombre, datos, admin)
    except (ArchivoDatosInvalidoError, DatosInsuficientesError) as error:
        raise _error_http(error) from None
    auditoria.registrar(
        "datos_entrenamiento_subidos",
        request,
        archivo=registro.id,
        registros=registro.n_registros,
        rechazadas=registro.n_rechazadas,
        por=admin.alias,
    )
    return SubidaArchivoResponse(
        archivo=ArchivoEntrenamientoResponse.model_validate(registro),
        rechazadas=[FilaRechazada(**r) for r in datos.rechazadas],
    )


@router.delete("/datos/{archivo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_archivo(
    archivo_id: str,
    request: Request,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
) -> None:
    registro = db.get(ArchivoEntrenamiento, archivo_id)
    if registro is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado"
        )
    servicio.eliminar_archivo(db, registro)
    auditoria.registrar(
        "datos_entrenamiento_eliminados", request, archivo=archivo_id, por=admin.alias
    )


# --------------------------------------------------------------- versiones --
@router.get("/versiones", response_model=list[VersionModeloResponse])
def listar_versiones(db: Session = DbSession) -> list[VersionModeloResponse]:
    versiones = db.scalars(
        select(VersionModelo).order_by(VersionModelo.created_at.desc())
    ).all()
    return [
        VersionModeloResponse.model_validate(version).model_copy(
            update={
                "disponible": servicio.modelo_presente(version),
                "carpeta": servicio.carpeta_visible(version),
            }
        )
        for version in versiones
    ]


@router.post(
    "/versiones/subir",
    response_model=VersionModeloResponse,
    status_code=status.HTTP_201_CREATED,
)
def subir_version(
    request: Request,
    archivo: UploadFile = ARCHIVO_MODELO,
    nombre: str | None = NOMBRE_VERSION,
    orden_clases: str | None = ORDEN_CLASES,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
) -> VersionModelo:
    """Recibe un modelo entrenado en otro servidor (el .zip que entrega
    "Descargar"). Queda como version nueva, sin activar."""
    maximo = settings.modelo_subido_max_mb * 1024 * 1024
    orden = tuple(c.strip() for c in (orden_clases or "").split(",") if c.strip())
    version_id = str(uuid4())
    destino = Path(settings.modelos_versiones_dir) / "subidos" / version_id

    with tempfile.TemporaryFile() as copia:
        recibidos = 0
        while bloque := archivo.file.read(TAMANO_BLOQUE):
            recibidos += len(bloque)
            if recibidos > maximo:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail=(
                        "El archivo supera el máximo de "
                        f"{settings.modelo_subido_max_mb} MB."
                    ),
                )
            copia.write(bloque)
        copia.seek(0)
        try:
            labels = servicio.importar_modelo_zip(copia, destino, orden, maximo)
        except ModeloInvalidoError as error:
            shutil.rmtree(destino, ignore_errors=True)
            raise _error_http(error) from None

    nombre_archivo = Path(archivo.filename or "modelo.zip").stem
    version = VersionModelo(
        id=version_id,
        nombre=(nombre or "").strip()[:255] or f"Subido: {nombre_archivo}"[:255],
        ruta=str(destino),
        origen="subido",
        labels=labels,
        creado_por=admin.nombre,
    )
    db.add(version)
    db.commit()
    auditoria.registrar("modelo_subido", request, version=version.id, por=admin.alias)
    return version


@router.get("/versiones/{version_id}/descargar")
def descargar_version(version_id: str, db: Session = DbSession) -> FileResponse:
    version = _buscar_version(db, version_id)
    try:
        ruta_zip = servicio.empaquetar_version(version)
    except ConflictoError as error:
        raise _error_http(error) from None
    fecha = version.created_at.strftime("%Y%m%d-%H%M")
    return FileResponse(
        ruta_zip,
        media_type="application/zip",
        filename=f"priorizai-modelo-{fecha}-{version.id[:8]}.zip",
        background=BackgroundTask(os.remove, ruta_zip),
    )


@router.post("/versiones/{version_id}/activar", response_model=CambioModeloResponse)
def activar_version(
    version_id: str,
    request: Request,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
    priorizador: PriorizadorIntercambiable = PriorizadorLocal,
) -> CambioModelo:
    _rechazar_si_remoto()
    version = _buscar_version(db, version_id)
    try:
        cambio = servicio.activar_version(db, version, admin, priorizador)
    except ConflictoError as error:
        raise _error_http(error) from None
    auditoria.registrar(
        "modelo_activado",
        request,
        version=version.id,
        accion=cambio.accion,
        por=admin.alias,
    )
    return cambio


@router.get("/cambios", response_model=list[CambioModeloResponse])
def listar_cambios(db: Session = DbSession) -> list[CambioModelo]:
    return list(
        db.scalars(select(CambioModelo).order_by(CambioModelo.created_at.desc())).all()
    )
