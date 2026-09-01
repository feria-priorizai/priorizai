from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.tiempo import utc_now


class ModificacionPrioridad(Base):
    __tablename__ = "modificaciones_prioridad"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    interconsulta_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("interconsultas.id"),
        nullable=False,
        index=True,
    )
    prioridad_anterior: Mapped[str | None] = mapped_column(String(20), nullable=True)
    prioridad_nueva: Mapped[str] = mapped_column(String(20), nullable=False)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    medico_responsable: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        nullable=False,
    )

    interconsulta = relationship("Interconsulta", back_populates="modificaciones")
