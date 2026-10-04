from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core import auditoria
from app.core.config import settings
from app.core.database import get_db
from app.models.interconsulta import Interconsulta
from app.models.usuario import Usuario
from app.schemas.auth import CambiarPasswordRequest, LoginRequest, UsuarioResponse
from app.services.auth import (
    ROL_ADMINISTRADOR,
    ROL_MEDICO,
    CredencialesInvalidasError,
    UsuarioBloqueadoError,
    abrir_sesion,
    autenticar,
    cambiar_password,
    cerrar_sesion,
    normalizar_alias,
    usuario_de_token,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_SESION = "priorizai_sesion"

DbSession = Depends(get_db)


def sesion_valida(request: Request, db: Session = DbSession) -> Usuario:
    """Usuario de la cookie, aunque todavia deba cambiar su contrasena. Solo la
    usan /me y el cambio de contrasena; el resto de la API usa usuario_actual."""
    usuario = usuario_de_token(db, request.cookies.get(COOKIE_SESION))
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Debes iniciar sesión",
        )
    return usuario


SesionValida = Depends(sesion_valida)


def usuario_actual(usuario: Usuario = SesionValida) -> Usuario:
    """Exige una sesion valida. Se aplica en la API y no solo en el frontend:
    ocultar pantallas no impide llamar a los endpoints directamente."""
    if usuario.debe_cambiar_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debes cambiar tu contraseña antes de continuar",
        )
    return usuario


UsuarioActual = Depends(usuario_actual)


def administrador_actual(usuario: Usuario = UsuarioActual) -> Usuario:
    if usuario.rol != ROL_ADMINISTRADOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un administrador puede realizar esta acción",
        )
    return usuario


AdministradorActual = Depends(administrador_actual)


ROLES_CLINICOS = frozenset({ROL_MEDICO, ROL_ADMINISTRADOR})


def clinico_actual(usuario: Usuario = UsuarioActual) -> Usuario:
    """Decisiones clinicas, como cambiar una prioridad: su autor queda en el
    historial como medico responsable."""
    if usuario.rol not in ROLES_CLINICOS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un médico o un administrador puede realizar esta acción",
        )
    return usuario


ClinicoActual = Depends(clinico_actual)


def _filtrar_por_especialidad_si_medico(query, usuario: Usuario):
    """Aplica filtro por especialidad si el usuario es medico.

    Los administradores ven todas las interconsultas; los medicos solo
    las de su especialidad (espec_destino).
    """
    if usuario.rol == ROL_MEDICO and usuario.especialidad:
        return query.where(Interconsulta.espec_destino == usuario.especialidad)
    return query


def _error_bloqueo(error: UsuarioBloqueadoError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=(
            "Demasiados intentos fallidos. Intenta nuevamente en "
            f"{error.minutos_restantes} minuto"
            f"{'s' if error.minutos_restantes != 1 else ''}."
        ),
    )


@router.post("/login", response_model=UsuarioResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = DbSession,
) -> Usuario:
    alias = normalizar_alias(payload.alias)
    try:
        usuario = autenticar(db, payload.alias, payload.password)
    except CredencialesInvalidasError:
        auditoria.registrar("login_fallido", request, alias=alias)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo iniciar sesión: alias o contraseña incorrectos",
        ) from None
    except UsuarioBloqueadoError as error:
        auditoria.registrar("login_bloqueado", request, alias=alias)
        raise _error_bloqueo(error) from None

    token = abrir_sesion(db, usuario)
    auditoria.registrar("login_exitoso", request, alias=alias)
    response.set_cookie(
        COOKIE_SESION,
        token,
        max_age=settings.sesion_duracion_horas * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return usuario


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = DbSession) -> Response:
    token = request.cookies.get(COOKIE_SESION)
    usuario = usuario_de_token(db, token)
    if usuario is not None:
        auditoria.registrar("logout", request, alias=usuario.alias)
    cerrar_sesion(db, token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(
        COOKIE_SESION,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return response


@router.get("/me", response_model=UsuarioResponse)
def me(usuario: Usuario = SesionValida) -> Usuario:
    return usuario


@router.post("/cambiar-password", response_model=UsuarioResponse)
def cambiar_mi_password(
    payload: CambiarPasswordRequest,
    request: Request,
    usuario: Usuario = SesionValida,
    db: Session = DbSession,
) -> Usuario:
    """Cambia la contrasena propia. Las demas sesiones abiertas del usuario se
    cierran; la actual sigue."""
    try:
        actualizado = cambiar_password(
            db,
            usuario,
            password_actual=payload.password_actual,
            password_nueva=payload.password_nueva,
            token_sesion=request.cookies.get(COOKIE_SESION, ""),
        )
    except CredencialesInvalidasError:
        auditoria.registrar("cambio_password_fallido", request, alias=usuario.alias)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual no es correcta",
        ) from None
    except UsuarioBloqueadoError as error:
        auditoria.registrar("cambio_password_bloqueado", request, alias=usuario.alias)
        raise _error_bloqueo(error) from None
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None

    auditoria.registrar("password_cambiada", request, alias=actualizado.alias)
    return actualizado
