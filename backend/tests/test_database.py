"""Plomeria de base de datos: la dependencia `get_db` y la migracion casera.

`_asegurar_columnas_interconsultas` es un mini-Alembic que corre `ALTER TABLE` al
importar `app.main`. Ya agrego 6 columnas por esta via, y no tenia ningun test.
"""

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import StaticPool

import app.core.database as database_module
import app.main as main_module
from app.core.database import get_db
from app.main import COLUMNAS_NUEVAS, _asegurar_columnas_interconsultas

# --------------------------------------------------------------------------
# get_db
# --------------------------------------------------------------------------


class SesionEspia:
    def __init__(self) -> None:
        self.cerrada = False

    def close(self) -> None:
        self.cerrada = True


def test_get_db_entrega_la_sesion_y_la_cierra_al_terminar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    espia = SesionEspia()
    monkeypatch.setattr(database_module, "SessionLocal", lambda: espia)

    generador = get_db()
    sesion = next(generador)

    assert sesion is espia
    assert espia.cerrada is False

    with pytest.raises(StopIteration):
        next(generador)

    assert espia.cerrada is True


def test_get_db_cierra_la_sesion_aunque_el_consumidor_falle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    espia = SesionEspia()
    monkeypatch.setattr(database_module, "SessionLocal", lambda: espia)

    generador = get_db()
    next(generador)
    generador.close()

    assert espia.cerrada is True


# --------------------------------------------------------------------------
# _asegurar_columnas_interconsultas
# --------------------------------------------------------------------------

TABLA_VIEJA = """
    CREATE TABLE interconsultas (
        id VARCHAR(36) PRIMARY KEY,
        espec_origen VARCHAR(255) NOT NULL,
        edad INTEGER NOT NULL
    )
"""


@pytest.fixture
def engine_con_tabla_vieja(monkeypatch: pytest.MonkeyPatch):
    """Una `interconsultas` sin ninguna de las columnas agregadas despues."""
    motor = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with motor.begin() as conexion:
        conexion.execute(text(TABLA_VIEJA))
    monkeypatch.setattr(main_module, "engine", motor)
    try:
        yield motor
    finally:
        motor.dispose()


def _columnas(motor) -> set[str]:
    return {columna["name"] for columna in inspect(motor).get_columns("interconsultas")}


def test_asegurar_columnas_agrega_las_que_faltan(engine_con_tabla_vieja) -> None:
    assert _columnas(engine_con_tabla_vieja) == {"id", "espec_origen", "edad"}

    _asegurar_columnas_interconsultas()

    assert set(COLUMNAS_NUEVAS) <= _columnas(engine_con_tabla_vieja)


def test_asegurar_columnas_es_idempotente(engine_con_tabla_vieja) -> None:
    _asegurar_columnas_interconsultas()
    columnas_tras_la_primera = _columnas(engine_con_tabla_vieja)

    # La segunda corrida no debe intentar un ALTER TABLE ya aplicado.
    _asegurar_columnas_interconsultas()

    assert _columnas(engine_con_tabla_vieja) == columnas_tras_la_primera
