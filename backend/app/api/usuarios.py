"""Gestion de cuentas (HDU-15). Solo un administrador: en un sistema con datos
clinicos nadie se registra solo."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import AdministradorActual
from app.core import auditoria
from app.core.database import get_db
from app.models.usuario import Usuario
from app.schemas.auth import (
    CrearUsuarioRequest,
    EditarUsuarioRequest,
    EstadoUsuarioRequest,
    UsuarioResponse,
)
from app.services.auth import (
    AliasEnUsoError,
    CorreoEnUsoError,
    OperacionNoPermitidaError,
    cambiar_estado_usuario,
    crear_usuario,
    editar_usuario,
    eliminar_usuario,
)

router = APIRouter(
    prefix="/api/usuarios",
    tags=["usuarios"],
    dependencies=[AdministradorActual],
)

DbSession = Depends(get_db)


def _error_http(error: Exception) -> HTTPException:
    """Traduce los errores del servicio: repetidos y operaciones no permitidas
    son conflictos (409); datos invalidos, 422."""
    if isinstance(
        error, AliasEnUsoError | CorreoEnUsoError | OperacionNoPermitidaError
    ):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error))
    return HTTPException(status_code=422, detail=str(error))


def _buscar(db: Session, usuario_id: str) -> Usuario:
    usuario = db.get(Usuario, usuario_id)
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado"
        )
    return usuario


@router.get("", response_model=list[UsuarioResponse])
def listar_usuarios(db: Session = DbSession) -> list[Usuario]:
    return list(db.scalars(select(Usuario).order_by(Usuario.nombre)).all())


@router.post(
    "",
    response_model=UsuarioResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_cuenta(
    payload: CrearUsuarioRequest,
    request: Request,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
) -> Usuario:
    try:
        nuevo = crear_usuario(
            db,
            alias=payload.alias,
            nombre=payload.nombre,
            correo=payload.correo,
            rol=payload.rol,
            password=payload.password,
            especialidad=payload.especialidad,
        )
    except ValueError as error:
        raise _error_http(error) from None

    auditoria.registrar(
        "cuenta_creada", request, alias=nuevo.alias, rol=nuevo.rol, por=admin.alias
    )
    return nuevo


@router.patch("/{usuario_id}", response_model=UsuarioResponse)
def editar_cuenta(
    usuario_id: str,
    payload: EditarUsuarioRequest,
    request: Request,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
) -> Usuario:
    usuario = _buscar(db, usuario_id)
    try:
        editado = editar_usuario(
            db,
            usuario,
            por=admin,
            nombre=payload.nombre,
            correo=payload.correo,
            rol=payload.rol,
            especialidad=payload.especialidad,
            password_temporal=payload.password_temporal,
        )
    except (ValueError, OperacionNoPermitidaError) as error:
        db.rollback()
        raise _error_http(error) from None

    auditoria.registrar(
        "cuenta_editada", request, alias=editado.alias, rol=editado.rol, por=admin.alias
    )
    if payload.password_temporal:
        auditoria.registrar(
            "password_restablecida", request, alias=editado.alias, por=admin.alias
        )
    return editado


@router.patch("/{usuario_id}/estado", response_model=UsuarioResponse)
def cambiar_estado_cuenta(
    usuario_id: str,
    payload: EstadoUsuarioRequest,
    request: Request,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
) -> Usuario:
    usuario = _buscar(db, usuario_id)
    try:
        actualizado = cambiar_estado_usuario(
            db, usuario, por=admin, activo=payload.activo
        )
    except OperacionNoPermitidaError as error:
        raise _error_http(error) from None

    evento = "cuenta_desbloqueada" if payload.activo else "cuenta_bloqueada"
    auditoria.registrar(evento, request, alias=actualizado.alias, por=admin.alias)
    return actualizado


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_cuenta(
    usuario_id: str,
    request: Request,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
) -> Response:
    usuario = _buscar(db, usuario_id)
    alias = usuario.alias
    try:
        eliminar_usuario(db, usuario, por=admin)
    except OperacionNoPermitidaError as error:
        raise _error_http(error) from None

    auditoria.registrar("cuenta_eliminada", request, alias=alias, por=admin.alias)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
