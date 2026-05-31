from app.core.config import settings


def test_database_url() -> None:
    assert settings.database_url.startswith("postgresql://")
    assert settings.database_name == "priorizai_db"


def test_cors_origins() -> None:
    assert settings.cors_origins == ["http://localhost:3000"]
