from collections.abc import Generator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app
from app.models.interconsulta import Interconsulta
from app.schemas.priorizacion import ProbabilidadesPrioridad, ResultadoPriorizacion
from app.services.priorizador import get_priorizador


class PriorizadorFake:
    def predecir(
        self,
        interconsultas: list[Interconsulta],
    ) -> list[ResultadoPriorizacion]:
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


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db() -> Generator[Session]:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def override_get_priorizador() -> PriorizadorFake:
    return PriorizadorFake()


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_priorizador] = override_get_priorizador
client = TestClient(app)


def setup_function() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_priorizar_interconsultas_actualiza_resultado_modelo() -> None:
    db = TestingSessionLocal()
    interconsulta = Interconsulta(
        id="ic-001",
        espec_origen="Medicina General",
        edad=67,
        sexo="M",
        espec_destino="Cardiologia",
        prioridad_original_csv="Alta",
        historia_clinica="HTA DM2 insuficiencia cardiaca",
        fundamentos_diagnostico="Disnea progresiva",
        examenes_complementarios="Eco FEVI 35%",
        motivo_interconsulta="Evaluacion cardiologica urgente",
    )
    db.add(interconsulta)
    db.commit()
    db.close()

    response = client.post("/api/interconsultas/priorizar", json={"ids": ["ic-001"]})

    assert response.status_code == 200
    assert response.json() == {
        "total": 1,
        "resultados": [
            {
                "id": "ic-001",
                "prioridad": "alta",
                "confianza": 91.5,
                "probabilidades": {
                    "baja": 2.0,
                    "media": 6.5,
                    "alta": 91.5,
                },
            },
        ],
    }

    db = TestingSessionLocal()
    actualizada = db.get(Interconsulta, "ic-001")
    assert actualizada is not None
    assert actualizada.prioridad_sugerida_modelo == "alta"
    assert actualizada.confianza_modelo == 91.5
    assert actualizada.prob_baja == 2.0
    assert actualizada.prob_media == 6.5
    assert actualizada.prob_alta == 91.5
    assert actualizada.prioridad_actual == "alta"
    db.close()


def test_priorizar_interconsultas_retorna_404_si_falta_id() -> None:
    response = client.post("/api/interconsultas/priorizar", json={"ids": ["ic-x"]})

    assert response.status_code == 404
    assert response.json()["detail"] == {"interconsultas_no_encontradas": ["ic-x"]}
