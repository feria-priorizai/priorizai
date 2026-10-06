from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.tiempo import utc_now


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    alias: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    rol: Mapped[str] = mapped_column(String(40), nullable=False)
    especialidad: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    debe_cambiar_password: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False,
    )

    sesiones = relationship(
        "Sesion",
        back_populates="usuario",
        cascade="all, delete-orphan",
    )


class Sesion(Base):
    """Sesion abierta. Vive en la base y no en un token autocontenido (JWT) para
    que cerrar sesion la invalide de verdad: en un equipo compartido del hospital,
    borrar la cookie del navegador no alcanza."""

    __tablename__ = "sesiones"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    usuario_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("usuarios.id"),
        nullable=False,
        index=True,
    )
    expira_en: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ultimo_uso: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False,
    )

    usuario = relationship("Usuario", back_populates="sesiones")


class IntentoLogin(Base):
    """Fallos de login por alias, exista o no el usuario.

    Vive aparte de `usuarios` a proposito: si el contador estuviera en el
    usuario, solo los alias reales podrian bloquearse, y la respuesta de
    bloqueo delataria cuales existen.
    """

    __tablename__ = "intentos_login"

    alias: Mapped[str] = mapped_column(String(64), primary_key=True)
    fallos: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ultimo_fallo: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    bloqueado_hasta: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
