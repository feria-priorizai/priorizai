"""Plazos maximos de revision por prioridad (HDU-22). Cualquier usuario con
sesion los puede leer; solo un administrador los cambia. La restriccion vive
aca y no solo en la interfaz: ocultar el formulario no impide llamar a la API."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.auth import AdministradorActual, UsuarioActual
from app.core import auditoria
from app.core.database import get_db
from app.models.usuario import Usuario
from app.schemas.plazos_revision import PlazosRevision
from app.services.plazos_revision import guardar_plazos, obtener_plazos

router = APIRouter(
    prefix="/api/plazos-revision",
    tags=["plazos de revision"],
    dependencies=[UsuarioActual],
)

DbSession = Depends(get_db)


@router.get("", response_model=PlazosRevision)
def leer_plazos(db: Session = DbSession) -> dict[str, int]:
    return obtener_plazos(db)


@router.put("", response_model=PlazosRevision)
def definir_plazos(
    payload: PlazosRevision,
    request: Request,
    admin: Usuario = AdministradorActual,
    db: Session = DbSession,
) -> dict[str, int]:
    """Reemplaza los tres plazos de una vez: el orden entre prioridades solo se
    puede validar con los tres a la vista. El nuevo plazo rige para todas las
    pendientes desde la siguiente lectura, porque el atraso se calcula al leer."""
    try:
        plazos = guardar_plazos(db, payload.model_dump(), por=admin.alias)
    except ValueError as error:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(error)) from None

    auditoria.registrar("plazos_revision_editados", request, por=admin.alias, **plazos)
    return plazos
