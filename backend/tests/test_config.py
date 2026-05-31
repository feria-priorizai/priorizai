from app.core.config import settings


def test_database_url() -> None:
    assert settings.database_url.startswith("postgresql://")
    assert settings.database_name == "priorizai_db"
