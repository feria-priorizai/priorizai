from collections.abc import Generator
from datetime import datetime

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


def test_priorizar_interconsulta_invalida_retorna_422() -> None:
    db = TestingSessionLocal()
    db.add(
        Interconsulta(
            id="ic-invalida",
            espec_origen="Medicina General",
            edad=30,
            sexo="F",
            espec_destino="Cardiologia",
            prioridad_original_csv="Media",
            historia_clinica="",
            fundamentos_diagnostico="",
            examenes_complementarios="",
            motivo_interconsulta="",
        )
    )
    db.commit()
    db.close()

    response = client.post(
        "/api/interconsultas/priorizar",
        json={"ids": ["ic-invalida"]},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "informacion clinica suficiente" in detail["message"]
    assert detail["interconsultas_invalidas"] == ["ic-invalida"]


def test_priorizar_interconsultas_pendientes_respeta_limit() -> None:
    db = TestingSessionLocal()
    for index in range(3):
        db.add(
            Interconsulta(
                id=f"ic-p-{index}",
                espec_origen="Medicina General",
                edad=50 + index,
                sexo="F",
                espec_destino="Cardiologia",
                prioridad_original_csv="Media",
                historia_clinica="Antecedentes clinicos",
                fundamentos_diagnostico="Fundamentos",
                examenes_complementarios="",
                motivo_interconsulta="Control",
            )
        )
    db.add(
        Interconsulta(
            id="ic-ya-priorizada",
            espec_origen="Medicina General",
            edad=70,
            sexo="M",
            espec_destino="Neurologia",
            prioridad_original_csv="Alta",
            historia_clinica="Antecedentes",
            fundamentos_diagnostico="Fundamentos",
            examenes_complementarios="",
            motivo_interconsulta="Control",
            prioridad_sugerida_modelo="media",
            confianza_modelo=80.0,
        )
    )
    db.commit()
    db.close()

    response = client.post("/api/interconsultas/priorizar-pendientes?limit=2")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2

    db = TestingSessionLocal()
    priorizadas = (
        db.query(Interconsulta)
        .filter(Interconsulta.prioridad_sugerida_modelo == "alta")
        .count()
    )
    ya_priorizada = db.get(Interconsulta, "ic-ya-priorizada")
    assert priorizadas == 2
    assert ya_priorizada is not None
    assert ya_priorizada.prioridad_sugerida_modelo == "media"
    db.close()


def test_priorizar_pendientes_omite_interconsultas_invalidas() -> None:
    db = TestingSessionLocal()
    db.add(
        Interconsulta(
            id="ic-p-valida",
            espec_origen="Medicina General",
            edad=60,
            sexo="F",
            espec_destino="Cardiologia",
            prioridad_original_csv="Media",
            historia_clinica="Dolor toracico",
            fundamentos_diagnostico="Evaluacion",
            examenes_complementarios="",
            motivo_interconsulta="Control",
        )
    )
    db.add(
        Interconsulta(
            id="ic-p-invalida",
            espec_origen="Medicina General",
            edad=61,
            sexo="F",
            espec_destino="Cardiologia",
            prioridad_original_csv="Media",
            historia_clinica="",
            fundamentos_diagnostico="",
            examenes_complementarios="",
            motivo_interconsulta="",
        )
    )
    db.commit()
    db.close()

    response = client.post("/api/interconsultas/priorizar-pendientes?limit=10")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["resultados"][0]["id"] == "ic-p-valida"


def test_priorizar_pendientes_omite_interconsultas_con_espacios() -> None:
    db = TestingSessionLocal()
    db.add(
        Interconsulta(
            id="ic-p-espacios",
            espec_origen="Medicina General",
            edad=61,
            sexo="F",
            espec_destino="Cardiologia",
            prioridad_original_csv="Media",
            historia_clinica="   ",
            fundamentos_diagnostico="",
            examenes_complementarios="",
            motivo_interconsulta="",
        )
    )
    db.commit()
    db.close()

    response = client.post("/api/interconsultas/priorizar-pendientes?limit=10")

    assert response.status_code == 200
    assert response.json() == {"total": 0, "resultados": []}


def test_listado_ordena_por_prioridad_y_fecha_de_emision() -> None:
    # HU3-c1: prioridad descendente y, dentro de cada prioridad, fecha de
    # emision ascendente. HU3-c3: ante empate, orden estable por id.
    db = TestingSessionLocal()
    casos = [
        ("ic-b", "baja", datetime(2026, 1, 1)),
        ("ic-a2", "alta", datetime(2026, 3, 1)),
        ("ic-m", "media", datetime(2026, 2, 1)),
        ("ic-a1", "alta", datetime(2026, 1, 15)),
    ]
    for identificador, prioridad, fecha in casos:
        db.add(
            Interconsulta(
                id=identificador,
                espec_origen="Medicina General",
                edad=50,
                sexo="F",
                espec_destino="Cardiologia",
                prioridad_original_csv=prioridad,
                historia_clinica="Antecedentes",
                fundamentos_diagnostico="Fundamentos",
                examenes_complementarios="",
                motivo_interconsulta="Control",
                prioridad_actual=prioridad,
                fecha_emision=fecha,
            )
        )
    db.commit()
    db.close()

    response = client.get("/api/interconsultas")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    # alta (mas antigua primero) -> media -> baja
    assert ids == ["ic-a1", "ic-a2", "ic-m", "ic-b"]


def test_listado_ubica_al_final_las_interconsultas_sin_prioridad() -> None:
    db = TestingSessionLocal()
    db.add(
        Interconsulta(
            id="ic-con-prioridad",
            espec_origen="Medicina General",
            edad=50,
            sexo="F",
            espec_destino="Cardiologia",
            prioridad_original_csv="Baja",
            historia_clinica="Antecedentes",
            fundamentos_diagnostico="Fundamentos",
            examenes_complementarios="",
            motivo_interconsulta="Control",
            prioridad_actual="baja",
        )
    )
    db.add(
        Interconsulta(
            id="ic-sin-prioridad",
            espec_origen="Medicina General",
            edad=50,
            sexo="F",
            espec_destino="Cardiologia",
            prioridad_original_csv="",
            historia_clinica="Antecedentes",
            fundamentos_diagnostico="Fundamentos",
            examenes_complementarios="",
            motivo_interconsulta="Control",
            prioridad_actual=None,
        )
    )
    db.commit()
    db.close()

    response = client.get("/api/interconsultas")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert ids == ["ic-con-prioridad", "ic-sin-prioridad"]


def test_priorizar_no_pisa_prioridad_forzada_por_bandera_roja() -> None:
    # Regresion: PriorizadorFake sugiere "alta", pero con una bandera roja la
    # prioridad forzada debe mantenerse aunque el modelo sugiera otra cosa
    # (HU5-c3 / D5). La sugerencia del modelo igual queda registrada.
    db = TestingSessionLocal()
    db.add(
        Interconsulta(
            id="ic-bandera",
            espec_origen="Medicina General",
            edad=54,
            sexo="M",
            espec_destino="Cardiologia",
            prioridad_original_csv="Media",
            historia_clinica="Paciente con dolor toracico de inicio subito",
            fundamentos_diagnostico="Cuadro agudo",
            examenes_complementarios="",
            motivo_interconsulta="Evaluacion urgente",
            prioridad_actual="alta",
            bandera_roja=True,
            terminos_bandera_roja="dolor_toracico",
            prioridad_forzada_por_regla=True,
        )
    )
    db.commit()
    db.close()

    response = client.post(
        "/api/interconsultas/priorizar", json={"ids": ["ic-bandera"]}
    )

    assert response.status_code == 200

    db = TestingSessionLocal()
    actualizada = db.get(Interconsulta, "ic-bandera")
    assert actualizada is not None
    assert actualizada.prioridad_actual == "alta"
    assert actualizada.prioridad_forzada_por_regla is True
    assert actualizada.bandera_roja is True
    assert actualizada.prioridad_sugerida_modelo == "alta"
    db.close()


def test_priorizar_limpia_motivo_sin_prioridad_previo() -> None:
    # Si una carga anterior fallo por falta de modelo, el motivo queda guardado.
    # Al priorizar con exito debe limpiarse para no dejar un mensaje obsoleto.
    db = TestingSessionLocal()
    db.add(
        Interconsulta(
            id="ic-motivo-obsoleto",
            espec_origen="Medicina General",
            edad=44,
            sexo="F",
            espec_destino="Cardiologia",
            prioridad_original_csv="Media",
            historia_clinica="Control de rutina",
            fundamentos_diagnostico="Sin hallazgos",
            examenes_complementarios="",
            motivo_interconsulta="Control",
            motivo_sin_prioridad="No se pudo ejecutar el modelo predictivo: simulado",
        )
    )
    db.commit()
    db.close()

    response = client.post(
        "/api/interconsultas/priorizar",
        json={"ids": ["ic-motivo-obsoleto"]},
    )

    assert response.status_code == 200

    db = TestingSessionLocal()
    actualizada = db.get(Interconsulta, "ic-motivo-obsoleto")
    assert actualizada is not None
    assert actualizada.motivo_sin_prioridad is None
    assert actualizada.prioridad_actual == "alta"
    db.close()


def test_modificar_prioridad_persiste_historial() -> None:
    db = TestingSessionLocal()
    db.add(
        Interconsulta(
            id="ic-mod-001",
            espec_origen="Medicina General",
            edad=44,
            sexo="F",
            espec_destino="Dermatologia",
            prioridad_original_csv="Media",
            historia_clinica="Lesion cutanea",
            fundamentos_diagnostico="Sospecha clinica",
            examenes_complementarios="",
            motivo_interconsulta="Evaluacion",
            prioridad_actual="media",
        )
    )
    db.commit()
    db.close()

    response = client.patch(
        "/api/interconsultas/ic-mod-001/prioridad",
        json={
            "prioridad": "alta",
            "motivo": "Lesion de rapido crecimiento",
            "medico_responsable": "Dra. Test",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["prioridad_actual"] == "alta"
    assert len(body["modificaciones"]) == 1
    modificacion = body["modificaciones"][0]
    assert modificacion["prioridad_anterior"] == "media"
    assert modificacion["prioridad_nueva"] == "alta"
    assert modificacion["motivo"] == "Lesion de rapido crecimiento"
    assert modificacion["medico_responsable"] == "Dra. Test"

    db = TestingSessionLocal()
    actualizada = db.get(Interconsulta, "ic-mod-001")
    assert actualizada is not None
    assert actualizada.prioridad_actual == "alta"
    db.close()


def test_modificar_prioridad_rechaza_motivo_vacio() -> None:
    db = TestingSessionLocal()
    db.add(
        Interconsulta(
            id="ic-mod-002",
            espec_origen="Medicina General",
            edad=44,
            sexo="F",
            espec_destino="Dermatologia",
            prioridad_original_csv="Media",
            historia_clinica="Lesion cutanea",
            fundamentos_diagnostico="Sospecha clinica",
            examenes_complementarios="",
            motivo_interconsulta="Evaluacion",
            prioridad_actual="media",
        )
    )
    db.commit()
    db.close()

    response = client.patch(
        "/api/interconsultas/ic-mod-002/prioridad",
        json={
            "prioridad": "alta",
            "motivo": "   ",
            "medico_responsable": "Dra. Test",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "El motivo de modificacion es obligatorio"


def test_modificar_estado_persiste_revision() -> None:
    db = TestingSessionLocal()
    db.add(
        Interconsulta(
            id="ic-estado-001",
            espec_origen="Medicina General",
            edad=44,
            sexo="F",
            espec_destino="Dermatologia",
            prioridad_original_csv="Media",
            historia_clinica="Lesion cutanea",
            fundamentos_diagnostico="Sospecha clinica",
            examenes_complementarios="",
            motivo_interconsulta="Evaluacion",
            prioridad_actual="media",
            estado="pendiente",
        )
    )
    db.commit()
    db.close()

    response = client.patch(
        "/api/interconsultas/ic-estado-001/estado",
        json={"estado": "revisada"},
    )

    assert response.status_code == 200
    assert response.json()["estado"] == "revisada"

    db = TestingSessionLocal()
    actualizada = db.get(Interconsulta, "ic-estado-001")
    assert actualizada is not None
    assert actualizada.estado == "revisada"
    db.close()
