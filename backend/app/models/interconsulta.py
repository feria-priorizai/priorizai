from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class Interconsulta(Base):
    __tablename__ = "interconsultas"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    espec_origen: Mapped[str] = mapped_column(String(255), nullable=False)
    edad: Mapped[int] = mapped_column(Integer, nullable=False)
    sexo: Mapped[str] = mapped_column(String(20), nullable=False)
    espec_destino: Mapped[str] = mapped_column(String(255), nullable=False)
    prioridad_original_csv: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    historia_clinica: Mapped[str] = mapped_column(Text, nullable=False)
    fundamentos_diagnostico: Mapped[str] = mapped_column(Text, nullable=False)
    examenes_complementarios: Mapped[str | None] = mapped_column(Text, nullable=True)
    motivo_interconsulta: Mapped[str] = mapped_column(Text, nullable=False)

    prioridad_sugerida_modelo: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    confianza_modelo: Mapped[float | None] = mapped_column(Float, nullable=True)
    prob_baja: Mapped[float | None] = mapped_column(Float, nullable=True)
    prob_media: Mapped[float | None] = mapped_column(Float, nullable=True)
    prob_alta: Mapped[float | None] = mapped_column(Float, nullable=True)
    prioridad_actual: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Entidades clinicas detectadas por el NER, agrupadas por campo:
    # {"historia_clinica": [{clase, texto, inicio, fin, score}, ...], ...}
    # Los offsets son sobre el texto de ese campo, para poder resaltarlo.
    entidades: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    entidades_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    estado: Mapped[str] = mapped_column(
        String(20),
        default="pendiente",
        nullable=False,
    )
    motivo_sin_prioridad: Mapped[str | None] = mapped_column(Text, nullable=True)

    fecha_emision: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    bandera_roja: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    terminos_bandera_roja: Mapped[str | None] = mapped_column(Text, nullable=True)
    prioridad_forzada_por_regla: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
    modificaciones = relationship(
        "ModificacionPrioridad",
        back_populates="interconsulta",
        cascade="all, delete-orphan",
        order_by="ModificacionPrioridad.created_at.desc()",
    )
