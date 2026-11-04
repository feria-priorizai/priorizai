from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.tiempo import utc_now


class PlazoRevision(Base):
    """Plazo maximo de revision de un nivel de prioridad (HDU-22). Una fila por
    prioridad; la que no esta guardada usa el plazo de fabrica."""

    __tablename__ = "plazos_revision"

    prioridad: Mapped[str] = mapped_column(String(20), primary_key=True)
    dias: Mapped[int] = mapped_column(Integer, nullable=False)
    actualizado_por: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
