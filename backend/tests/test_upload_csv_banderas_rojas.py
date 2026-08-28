from collections.abc import Generator
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.main as main_module
from app.core.database import Base, get_db
from app.main import app
from app.models.interconsulta import Interconsulta

FIXTURE = Path(__file__).parent / "fixtures" / "interconsultas_banderas_rojas.csv"

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class PriorizadorNoDisponible:
    def predecir(self, interconsultas: list[Interconsulta]) -> list:
        raise OSError("Modelo no disponible: simulado para el test")


def override_get_db() -> Generator[Session]:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def setup_function() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    main_module.app.dependency_overrides = {get_db: override_get_db}


def test_upload_csv_aplica_banderas_rojas_sin_modelo_disponible(monkeypatch) -> None:
    monkeypatch.setattr(main_module, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(
        main_module, "get_priorizador", lambda: PriorizadorNoDisponible()
    )
    client = TestClient(app)

    with FIXTURE.open("rb") as archivo:
        response = client.post(
            "/upload-csv",
            files={"file": ("interconsultas.csv", archivo, "text/csv")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["inserted"] == 7
    assert body["prioritized"] == 0
    assert body["prioritization_status"] == "skipped"

    db = TestingSessionLocal()
    try:
        interconsultas = list(
            db.scalars(select(Interconsulta).order_by(Interconsulta.created_at)).all()
        )
        assert len(interconsultas) == 7

        por_historia = {ic.historia_clinica: ic for ic in interconsultas}

        afirmado = por_historia["Paciente con dolor toracico de inicio subito"]
        assert afirmado.bandera_roja is True
        assert afirmado.terminos_bandera_roja == "dolor_toracico"
        assert afirmado.prioridad_forzada_por_regla is True
        assert afirmado.prioridad_actual == "alta"
        assert afirmado.motivo_sin_prioridad is not None

        negado = por_historia["Paciente sin dolor toracico ni disnea"]
        assert negado.bandera_roja is False
        assert negado.prioridad_forzada_por_regla is False

        historico = por_historia["Antecedente de sepsis resuelta en 2019"]
        assert historico.bandera_roja is False

        hipotetico = por_historia[
            "Se deriva para descartar hemorragia digestiva ante anemia de estudio"
        ]
        assert hipotetico.bandera_roja is False

        pseudo_negacion = por_historia[
            "No se puede descartar sepsis en este cuadro clinico"
        ]
        assert pseudo_negacion.bandera_roja is True
        assert pseudo_negacion.terminos_bandera_roja == "sepsis"
        assert pseudo_negacion.prioridad_actual == "alta"

        terminador = por_historia["Sin dolor toracico pero con convulsiones activas"]
        assert terminador.bandera_roja is True
        assert terminador.terminos_bandera_roja == "convulsiones"

        sin_bandera = por_historia["Paciente control sano sin hallazgos relevantes"]
        assert sin_bandera.bandera_roja is False
        assert sin_bandera.terminos_bandera_roja is None
    finally:
        db.close()


def test_reevaluar_banderas_no_pisa_decision_medica_previa(monkeypatch) -> None:
    monkeypatch.setattr(main_module, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(
        main_module, "get_priorizador", lambda: PriorizadorNoDisponible()
    )
    client = TestClient(app)

    with FIXTURE.open("rb") as archivo:
        client.post(
            "/upload-csv",
            files={"file": ("interconsultas.csv", archivo, "text/csv")},
        )

    db = TestingSessionLocal()
    try:
        afirmado = db.scalar(
            select(Interconsulta).where(
                Interconsulta.historia_clinica
                == "Paciente con dolor toracico de inicio subito"
            )
        )
        assert afirmado is not None
        interconsulta_id = afirmado.id
    finally:
        db.close()

    respuesta_modificacion = client.patch(
        f"/api/interconsultas/{interconsulta_id}/prioridad",
        json={
            "prioridad": "media",
            "motivo": "Evaluado por el medico, no amerita prioridad alta",
            "medico_responsable": "Dra. Test",
        },
    )
    assert respuesta_modificacion.status_code == 200

    respuesta_reevaluar = client.post("/api/interconsultas/reevaluar-banderas")
    assert respuesta_reevaluar.status_code == 200

    db = TestingSessionLocal()
    try:
        actualizada = db.get(Interconsulta, interconsulta_id)
        assert actualizada is not None
        assert actualizada.bandera_roja is True
        assert actualizada.prioridad_actual == "media"
        assert actualizada.prioridad_forzada_por_regla is False
    finally:
        db.close()
