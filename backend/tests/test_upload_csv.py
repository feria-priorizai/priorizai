from typing import cast

from fastapi.testclient import TestClient

import app.main as main_module
from app.main import app

client = TestClient(app)


class DummySession:
    def __init__(self) -> None:
        self.executed: list[tuple[object, dict[str, object] | None]] = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def commit(self) -> None:
        return None

    def rollback(self) -> None:
        return None

    def close(self) -> None:
        return None


def test_upload_csv_success(monkeypatch) -> None:
    session = DummySession()
    monkeypatch.setattr(main_module, "SessionLocal", lambda: session)

    csv_content = (
        "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,PRIORIDAD,HISTORIA_CLINICA,FUNDAMENTOS_DIAGNOSTICO,EXAMENES_COMPLEMENTARIOS,MOTIVO_INTERCONSULTA\n"
        "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,ALTA,CANCER PULMONAR,Paciente estable.,,CONTROL DE ESPECIALIDAD\n"
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 200
    assert response.json() == {"inserted": 1, "stored": 1}
    assert len(session.executed) == 1
    params = session.executed[0][1]
    assert params is not None
    assert params["ESPEC_ORIGEN"] == "MEDICINA GENERAL"
    assert params["EDAD"] == 46
    assert params["SEXO"] == "FEMENINO"
    assert params["MOTIVO_INTERCONSULTA"] == "CONTROL DE ESPECIALIDAD"


def test_upload_csv_quoted_newline_field(monkeypatch) -> None:
    session = DummySession()
    monkeypatch.setattr(main_module, "SessionLocal", lambda: session)

    csv_content = (
        "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,PRIORIDAD,HISTORIA_CLINICA,FUNDAMENTOS_DIAGNOSTICO,EXAMENES_COMPLEMENTARIOS,MOTIVO_INTERCONSULTA\n"
        "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,ALTA,ESTADO GENERAL,"
        '"Paciente con antecedentes respiratorios.\nSe evalúa evolución posterior.",,CONTROL DE ESPECIALIDAD\n'
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 200
    assert response.json() == {"inserted": 1, "stored": 1}
    assert len(session.executed) == 1
    params = session.executed[0][1]
    assert params is not None
    fundamentos = cast(str, params["FUNDAMENTOS_DIAGNOSTICO"])
    assert "Paciente con antecedentes respiratorios." in fundamentos
    assert "Se evalúa evolución posterior." in fundamentos


def test_upload_csv_rejects_wrong_extension() -> None:
    csv_content = (
        "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,PRIORIDAD,HISTORIA_CLINICA,FUNDAMENTOS_DIAGNOSTICO,EXAMENES_COMPLEMENTARIOS,MOTIVO_INTERCONSULTA\n"
        "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,ALTA,CANCER PULMONAR,Paciente estable.,,CONTROL DE ESPECIALIDAD\n"
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.txt", csv_content, "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "El archivo debe ser un CSV válido"


def test_upload_csv_empty_edad_returns_error(monkeypatch) -> None:
    session = DummySession()
    monkeypatch.setattr(main_module, "SessionLocal", lambda: session)

    csv_content = (
        "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,PRIORIDAD,HISTORIA_CLINICA,FUNDAMENTOS_DIAGNOSTICO,EXAMENES_COMPLEMENTARIOS,MOTIVO_INTERCONSULTA\n"
        "MEDICINA GENERAL,,FEMENINO,RESPIRATORIO ADULTO,ALTA,CANCER PULMONAR,Paciente estable.,,CONTROL DE ESPECIALIDAD\n"
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "El campo EDAD está vacío en la fila 1"
