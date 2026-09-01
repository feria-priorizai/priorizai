import importlib

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app

client = TestClient(app)


def test_root() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_cors_preflight_from_frontend() -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


# --------------------------------------------------------------------------
# lifespan: todo el I/O de base ocurre al arrancar, no al importar
# --------------------------------------------------------------------------


def test_el_lifespan_prepara_la_base_y_verifica_las_credenciales(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Con `create_all` a nivel de modulo, `import app.main` abria conexion: los
    tests no corrian sin Postgres y la CI levantaba un servicio solo para eso."""
    llamadas: list[str] = []

    monkeypatch.setattr(
        main_module.settings,
        "verificar_credenciales",
        lambda: llamadas.append("credenciales"),
    )
    monkeypatch.setattr(
        main_module.Base.metadata,
        "create_all",
        lambda **_: llamadas.append("create_all"),
    )
    monkeypatch.setattr(
        main_module,
        "_asegurar_columnas_interconsultas",
        lambda: llamadas.append("columnas"),
    )

    with TestClient(main_module.app) as cliente:
        assert cliente.get("/health").status_code == 200

    assert llamadas == ["credenciales", "create_all", "columnas"]


def test_importar_el_modulo_no_toca_la_base(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Sin el lifespan, importar el modulo bastaba para abrir conexion."""
    monkeypatch.setattr(
        main_module.Base.metadata,
        "create_all",
        lambda **_: pytest.fail("create_all no debe correr fuera del lifespan"),
    )

    importlib.reload(main_module)
