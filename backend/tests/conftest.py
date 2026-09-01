"""Fixtures compartidas de la suite.

Los `dependency_overrides` de FastAPI se registran y se limpian aca. `app` es un
singleton de modulo: un override que sobrevive a su test contamina a los que
siguen y la suite pasa a depender del orden alfabetico de los archivos.
"""

from collections.abc import Callable, Iterator
from itertools import count

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.main as main_module
from app.core.database import Base, get_db
from app.main import app
from app.models.interconsulta import Interconsulta
from app.schemas.priorizacion import ProbabilidadesPrioridad, ResultadoPriorizacion
from app.services.priorizador import get_priorizador


class PriorizadorFake:
    """Doble del modelo: siempre responde "alta" con 91.5 de confianza.

    Registra lo que recibio para poder afirmar a quien se mando a predecir.
    """

    def __init__(self) -> None:
        self.llamadas: list[list[Interconsulta]] = []

    def predecir(
        self,
        interconsultas: list[Interconsulta],
    ) -> list[ResultadoPriorizacion]:
        self.llamadas.append(list(interconsultas))
        return [
            ResultadoPriorizacion(
                id=interconsulta.id,
                prioridad="alta",
                confianza=91.5,
                probabilidades=ProbabilidadesPrioridad(
                    baja=2.0,
                    media=6.5,
                    alta=91.5,
                ),
            )
            for interconsulta in interconsultas
        ]


class PriorizadorCaido:
    """Doble del modelo cuando no se puede cargar: rutas 503 y `skipped`."""

    def predecir(
        self,
        interconsultas: list[Interconsulta],
    ) -> list[ResultadoPriorizacion]:
        raise OSError("Modelo no disponible: simulado para el test")


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """SQLite en memoria. `StaticPool` mantiene una unica conexion para que todas
    las sesiones vean la misma base."""
    motor = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    try:
        yield motor
    finally:
        motor.dispose()


@pytest.fixture(scope="session")
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def _esquema_limpio(engine: Engine) -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture(autouse=True)
def _sin_overrides() -> Iterator[None]:
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def db(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    """Sesion para preparar datos y verificar resultados dentro del test."""
    sesion = session_factory()
    try:
        yield sesion
    finally:
        sesion.close()


@pytest.fixture
def priorizador_fake() -> PriorizadorFake:
    return PriorizadorFake()


@pytest.fixture
def priorizador_caido() -> PriorizadorCaido:
    return PriorizadorCaido()


def _client_con(
    session_factory: sessionmaker[Session],
    priorizador: object,
) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        sesion = session_factory()
        try:
            yield sesion
        finally:
            sesion.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_priorizador] = lambda: priorizador
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def client(
    _sin_overrides: None,
    session_factory: sessionmaker[Session],
    priorizador_fake: PriorizadorFake,
) -> Iterator[TestClient]:
    yield from _client_con(session_factory, priorizador_fake)


@pytest.fixture
def client_sin_modelo(
    _sin_overrides: None,
    session_factory: sessionmaker[Session],
    priorizador_caido: PriorizadorCaido,
) -> Iterator[TestClient]:
    yield from _client_con(session_factory, priorizador_caido)


@pytest.fixture
def nueva_interconsulta() -> Callable[..., Interconsulta]:
    """Arma una interconsulta valida; cada campo se puede pisar por nombre."""
    contador = count(1)

    def crear(**campos: object) -> Interconsulta:
        valores: dict[str, object] = {
            "id": f"ic-{next(contador):03d}",
            "espec_origen": "Medicina General",
            "edad": 50,
            "sexo": "F",
            "espec_destino": "Cardiologia",
            "prioridad_original_csv": "Media",
            "historia_clinica": "Antecedentes clinicos",
            "fundamentos_diagnostico": "Fundamentos",
            "examenes_complementarios": "",
            "motivo_interconsulta": "Control",
        }
        valores.update(campos)
        return Interconsulta(**valores)

    return crear


@pytest.fixture
def guardar_interconsulta(
    db: Session,
    nueva_interconsulta: Callable[..., Interconsulta],
) -> Callable[..., Interconsulta]:
    def guardar(**campos: object) -> Interconsulta:
        interconsulta = nueva_interconsulta(**campos)
        db.add(interconsulta)
        db.commit()
        return interconsulta

    return guardar


@pytest.fixture
def releer(db: Session) -> Callable[[str], Interconsulta | None]:
    """Relee una interconsulta descartando lo cacheado: el endpoint escribe con
    otra sesion, asi que la del test no ve el cambio sin cerrar su transaccion."""

    def _releer(interconsulta_id: str) -> Interconsulta | None:
        db.rollback()
        return db.get(Interconsulta, interconsulta_id)

    return _releer


@pytest.fixture
def ingesta_con_sqlite(
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`/upload-csv` no resuelve la sesion por `Depends`: la toma de
    `main.SessionLocal`, asi que hay que sustituirla en el modulo."""
    monkeypatch.setattr(main_module, "SessionLocal", session_factory)


@pytest.fixture
def ingesta_con_modelo(
    ingesta_con_sqlite: None,
    priorizador_fake: PriorizadorFake,
    monkeypatch: pytest.MonkeyPatch,
) -> PriorizadorFake:
    monkeypatch.setattr(main_module, "get_priorizador", lambda: priorizador_fake)
    return priorizador_fake


@pytest.fixture
def ingesta_sin_modelo(
    ingesta_con_sqlite: None,
    priorizador_caido: PriorizadorCaido,
    monkeypatch: pytest.MonkeyPatch,
) -> PriorizadorCaido:
    monkeypatch.setattr(main_module, "get_priorizador", lambda: priorizador_caido)
    return priorizador_caido
