"""Configuracion: armado de la URL de base y guardia de credenciales."""

import pytest

from app.core.config import CREDENCIALES_POR_DEFECTO, Settings, settings


def test_database_url() -> None:
    assert settings.database_url.startswith("postgresql://")
    assert settings.database_name == "priorizai_db"


def test_cors_origins() -> None:
    assert settings.cors_origins == ["http://localhost:3000"]


# --------------------------------------------------------------------------
# DATABASE_URL completa
# --------------------------------------------------------------------------


def test_database_url_completa_tiene_prioridad(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sin esto no habia forma de apuntar la app a otra base (SQLite en los
    tests, un servicio gestionado en produccion) sin tocar codigo."""
    propias = Settings()
    monkeypatch.setattr(propias, "database_url_completa", "sqlite:///./local.db")

    assert propias.database_url == "sqlite:///./local.db"


def test_database_url_se_arma_con_las_piezas_si_no_hay_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    propias = Settings()
    monkeypatch.setattr(propias, "database_url_completa", "")
    monkeypatch.setattr(propias, "database_user", "u")
    monkeypatch.setattr(propias, "database_password", "p")
    monkeypatch.setattr(propias, "database_host", "h")
    monkeypatch.setattr(propias, "database_port", 5433)
    monkeypatch.setattr(propias, "database_name", "d")

    assert propias.database_url == "postgresql://u:p@h:5433/d"


# --------------------------------------------------------------------------
# verificar_credenciales
# --------------------------------------------------------------------------


def _con_credenciales(
    monkeypatch: pytest.MonkeyPatch,
    *,
    usuario: str,
    password: str,
    debug: bool = False,
    url: str = "",
) -> Settings:
    propias = Settings()
    monkeypatch.setattr(propias, "database_user", usuario)
    monkeypatch.setattr(propias, "database_password", password)
    monkeypatch.setattr(propias, "database_url_completa", url)
    monkeypatch.setattr(propias, "debug", debug)
    return propias


def test_credenciales_de_ejemplo_frenan_el_arranque(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Estaban como valor por defecto en el codigo: un despliegue con el `.env`
    incompleto levantaba igual contra las credenciales de ejemplo."""
    propias = _con_credenciales(
        monkeypatch,
        usuario=CREDENCIALES_POR_DEFECTO["database_user"],
        password=CREDENCIALES_POR_DEFECTO["database_password"],
    )

    with pytest.raises(RuntimeError, match="valor de ejemplo"):
        propias.verificar_credenciales()


def test_el_mensaje_nombra_las_credenciales_pendientes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    propias = _con_credenciales(
        monkeypatch,
        usuario="usuario_real",
        password=CREDENCIALES_POR_DEFECTO["database_password"],
    )

    with pytest.raises(RuntimeError, match="database_password"):
        propias.verificar_credenciales()


def test_credenciales_propias_dejan_arrancar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    propias = _con_credenciales(
        monkeypatch, usuario="usuario_real", password="password_real"
    )

    propias.verificar_credenciales()
    assert propias.credenciales_por_defecto() == []


def test_en_desarrollo_se_permiten_las_de_ejemplo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """El compose de desarrollo usa justamente esas credenciales."""
    propias = _con_credenciales(
        monkeypatch,
        usuario=CREDENCIALES_POR_DEFECTO["database_user"],
        password=CREDENCIALES_POR_DEFECTO["database_password"],
        debug=True,
    )

    propias.verificar_credenciales()


def test_con_database_url_no_se_miran_las_piezas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    propias = _con_credenciales(
        monkeypatch,
        usuario=CREDENCIALES_POR_DEFECTO["database_user"],
        password=CREDENCIALES_POR_DEFECTO["database_password"],
        url="postgresql://otro:secreto@host:5432/db",
    )

    propias.verificar_credenciales()
    assert propias.credenciales_por_defecto() == []
