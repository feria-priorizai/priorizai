from io import BytesIO
from typing import cast

from fastapi.testclient import TestClient
from openpyxl import Workbook

import app.main as main_module
from app.main import app
from app.models.interconsulta import Interconsulta
from app.schemas.priorizacion import ProbabilidadesPrioridad, ResultadoPriorizacion

client = TestClient(app)

HEADER = (
    "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,PRIORIDAD,HISTORIA_CLINICA,"
    "FUNDAMENTOS_DIAGNOSTICO,EXAMENES_COMPLEMENTARIOS,MOTIVO_INTERCONSULTA\n"
)


class DummySession:
    def __init__(self) -> None:
        self.executed: list[tuple[object, dict[str, object] | None]] = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def scalars(self, stmt):
        interconsultas = []
        for _, params in self.executed:
            if params is None:
                continue
            edad = params["edad"]
            assert isinstance(edad, int)
            interconsultas.append(
                Interconsulta(
                    id=str(params["id"]),
                    espec_origen=str(params["espec_origen"]),
                    edad=edad,
                    sexo=str(params["sexo"]),
                    espec_destino=str(params["espec_destino"]),
                    prioridad_original_csv=str(params["prioridad_original_csv"]),
                    historia_clinica=str(params["historia_clinica"]),
                    fundamentos_diagnostico=str(params["fundamentos_diagnostico"]),
                    examenes_complementarios=str(params["examenes_complementarios"]),
                    motivo_interconsulta=str(params["motivo_interconsulta"]),
                    estado=str(params["estado"]),
                    created_at=params["created_at"],
                    updated_at=params["updated_at"],
                )
            )
        return DummyScalarResult(interconsultas)

    def commit(self) -> None:
        return None

    def rollback(self) -> None:
        return None

    def close(self) -> None:
        return None


class DummyScalarResult:
    def __init__(self, interconsultas: list[Interconsulta]) -> None:
        self.interconsultas = interconsultas

    def all(self) -> list[Interconsulta]:
        return self.interconsultas


class DummyPriorizador:
    def predecir(
        self,
        interconsultas: list[Interconsulta],
    ) -> list[ResultadoPriorizacion]:
        return [
            ResultadoPriorizacion(
                id=interconsulta.id,
                prioridad="alta",
                confianza=90.0,
                probabilidades=ProbabilidadesPrioridad(
                    baja=3.0,
                    media=7.0,
                    alta=90.0,
                ),
            )
            for interconsulta in interconsultas
        ]


def setup_function() -> None:
    main_module.app.dependency_overrides = {}


def usar_session_dummy(monkeypatch) -> DummySession:
    session = DummySession()
    monkeypatch.setattr(main_module, "SessionLocal", lambda: session)
    monkeypatch.setattr(main_module, "get_priorizador", lambda: DummyPriorizador())
    return session


def test_upload_csv_success(monkeypatch) -> None:
    session = usar_session_dummy(monkeypatch)
    csv_content = (
        HEADER
        + "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,ALTA,"
        + "CANCER PULMONAR,Paciente estable.,,CONTROL DE ESPECIALIDAD\n"
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["inserted"] == 1
    assert body["stored"] == 1
    assert body["prioritized"] == 1
    assert body["prioritization_status"] == "completed"
    assert body["file_type"] == "csv"
    assert len(body["ids"]) == 1
    assert len(session.executed) == 1
    params = session.executed[0][1]
    assert params is not None
    assert params["espec_origen"] == "MEDICINA GENERAL"
    assert params["edad"] == 46
    assert params["sexo"] == "FEMENINO"
    assert params["prioridad_original_csv"] == "ALTA"
    assert params["estado"] == "pendiente"
    assert params["motivo_interconsulta"] == "CONTROL DE ESPECIALIDAD"


def test_upload_csv_success_with_semicolon_delimiter(monkeypatch) -> None:
    session = usar_session_dummy(monkeypatch)
    csv_content = (
        HEADER.replace(",", ";")
        + "MEDICINA GENERAL;46;FEMENINO;RESPIRATORIO ADULTO;ALTA;"
        + "CANCER PULMONAR;Paciente estable;;CONTROL DE ESPECIALIDAD\n"
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 200
    assert response.json()["inserted"] == 1
    assert response.json()["prioritized"] == 1
    params = session.executed[0][1]
    assert params is not None
    assert params["edad"] == 46
    assert params["historia_clinica"] == "CANCER PULMONAR"
    assert params["fundamentos_diagnostico"] == "Paciente estable"


def test_upload_xlsx_success_with_commas_and_newlines(monkeypatch) -> None:
    session = usar_session_dummy(monkeypatch)

    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADER.strip().split(","))
    sheet.append(
        [
            "MEDICINA GENERAL",
            5,
            "MASCULINO",
            "NEUROLOGIA INFANTIL",
            "MEDIA",
            "Deficit atencional, hiperactividad",
            "Informe psicologo:\napoyo frente a regulacion",
            "",
            "CONTROL DE ESPECIALIDAD",
        ]
    )
    buffer = BytesIO()
    workbook.save(buffer)

    response = client.post(
        "/upload-csv",
        files={
            "file": (
                "interconsultas.xlsx",
                buffer.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 200
    assert response.json()["file_type"] == "xlsx"
    assert response.json()["prioritized"] == 1
    assert response.json()["prioritization_status"] == "completed"
    assert len(session.executed) == 1
    params = session.executed[0][1]
    assert params is not None
    historia = cast(str, params["historia_clinica"])
    fundamentos = cast(str, params["fundamentos_diagnostico"])
    assert "Deficit atencional, hiperactividad" == historia
    assert "Informe psicologo:" in fundamentos
    assert "apoyo frente a regulacion" in fundamentos


def test_upload_csv_quoted_newline_field(monkeypatch) -> None:
    session = usar_session_dummy(monkeypatch)
    csv_content = (
        HEADER
        + "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,ALTA,ESTADO GENERAL,"
        + '"Paciente con antecedentes respiratorios.\nSe evalua evolucion posterior.",,CONTROL DE ESPECIALIDAD\n'
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 200
    params = session.executed[0][1]
    assert params is not None
    fundamentos = cast(str, params["fundamentos_diagnostico"])
    assert "Paciente con antecedentes respiratorios." in fundamentos
    assert "Se evalua evolucion posterior." in fundamentos


def test_upload_csv_rejects_unescaped_extra_columns(monkeypatch) -> None:
    session = usar_session_dummy(monkeypatch)
    csv_content = (
        HEADER
        + "MEDICINA GENERAL,71,MASCULINO,OTORRINOLARINGOLOGIA,MEDIA,"
        + "HIPOACUSIA,HTA,EXAMEN BASE,CONTROL DE ESPECIALIDAD,con coma extra\n"
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 400
    assert "Fila CSV 2 invalida" in response.json()["detail"]
    assert session.executed == []


def test_upload_csv_rejects_wrong_extension() -> None:
    csv_content = (
        HEADER
        + "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,ALTA,"
        + "CANCER PULMONAR,Paciente estable.,,CONTROL DE ESPECIALIDAD\n"
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.txt", csv_content, "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "El archivo debe ser CSV o XLSX valido"


def test_upload_file_empty_edad_returns_error(monkeypatch) -> None:
    session = usar_session_dummy(monkeypatch)
    csv_content = (
        HEADER
        + "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,ALTA,"
        + "CANCER PULMONAR,Paciente estable.,,CONTROL DE ESPECIALIDAD\n"
        + "MEDICINA GENERAL,,FEMENINO,RESPIRATORIO ADULTO,ALTA,"
        + "CANCER PULMONAR,Paciente estable.,,CONTROL DE ESPECIALIDAD\n"
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("test.csv", csv_content, "text/csv")},
    )

    # Las filas validas se guardan; las incompletas se rechazan (no se guardan).
    assert response.status_code == 200
    body = response.json()
    assert body["inserted"] == 1
    assert body["stored"] == 1
    assert body["rejected_count"] == 1
    assert body["rejected"][0]["fila"] == 3
    assert body["rejected"][0]["campos_faltantes"] == ["EDAD"]
    assert len(session.executed) == 1  # Solo se inserto la fila valida
