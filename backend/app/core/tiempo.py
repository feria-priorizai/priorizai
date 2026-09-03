from datetime import UTC, datetime


def utc_now() -> datetime:
    """Momento actual en UTC. Compartida por los modelos para que `created_at` y
    `updated_at` no dependan de la zona horaria del contenedor."""
    return datetime.now(UTC)
