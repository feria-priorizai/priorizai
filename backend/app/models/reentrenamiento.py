from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.tiempo import utc_now


class VersionModelo(Base):
    """Un modelo de priorizacion que la app puede usar. Solo una esta activa.

    La version "inicial" es el modelo de MODEL_PATH: se registra sola al
    arrancar para que siempre se pueda volver a el.
    """

    __tablename__ = "versiones_modelo"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    ruta: Mapped[str] = mapped_column(String(1024), nullable=False)
    # inicial | reentrenamiento | subido
    origen: Mapped[str] = mapped_column(String(20), nullable=False)
    # Orden de las salidas del modelo. Vacio = se resuelve con su config.json.
    labels: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    metricas: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    parametros: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    n_registros: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reentrenamiento_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    activa: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    creado_por: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False,
    )


class CambioModelo(Base):
    """Registro de quien activo o revirtio cada version, y cuando."""

    __tablename__ = "cambios_modelo"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    version_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("versiones_modelo.id"),
        nullable=False,
        index=True,
    )
    version_anterior_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # activar | revertir
    accion: Mapped[str] = mapped_column(String(20), nullable=False)
    usuario: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False,
    )


class ArchivoEntrenamiento(Base):
    """Interconsultas ya priorizadas que el administrador subio en un archivo
    (.csv, .xlsx o .json) para entrenar con ellas, ademas de las revisadas en
    la app. Los ejemplos quedan en un .jsonl en el disco del servidor."""

    __tablename__ = "archivos_entrenamiento"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    ruta: Mapped[str] = mapped_column(String(1024), nullable=False)
    n_registros: Mapped[int] = mapped_column(Integer, nullable=False)
    registros_por_clase: Mapped[dict] = mapped_column(JSON, nullable=False)
    n_rechazadas: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    creado_por: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False,
    )


class Reentrenamiento(Base):
    """Una corrida de reentrenamiento: de una a tres configuraciones que se
    entrenan una tras otra y se comparan con el modelo en uso."""

    __tablename__ = "reentrenamientos"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    # en_curso | terminado | error | cancelado
    estado: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    dispositivo: Mapped[str] = mapped_column(String(10), nullable=False)
    automatico: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    configuraciones: Mapped[list] = mapped_column(JSON, nullable=False)
    porcentaje_evaluacion: Mapped[int] = mapped_column(Integer, nullable=False)
    n_registros: Mapped[int] = mapped_column(Integer, nullable=False)
    registros_por_clase: Mapped[dict] = mapped_column(JSON, nullable=False)
    n_evaluacion: Mapped[int] = mapped_column(Integer, nullable=False)
    # Version que estaba en uso al lanzar: es contra la que se compara.
    version_base_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    progreso: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    log: Mapped[str] = mapped_column(Text, default="", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    resultados: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    iniciado_por: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False,
    )
    terminado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
