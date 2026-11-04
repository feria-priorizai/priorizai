from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

# Zona del establecimiento. Los dias de espera se cuentan en el calendario de
# Chile: contados en UTC, una interconsulta pasaba a atrasada la noche anterior.
# En la imagen slim no hay base de zonas del sistema; la trae el paquete tzdata.
ZONA_CHILE = ZoneInfo("America/Santiago")


def utc_now() -> datetime:
    """Momento actual en UTC. Compartida por los modelos para que `created_at` y
    `updated_at` no dependan de la zona horaria del contenedor."""
    return datetime.now(UTC)


def hoy_chile() -> date:
    """Fecha de hoy en Chile, para contar dias de calendario."""
    return datetime.now(ZONA_CHILE).date()
