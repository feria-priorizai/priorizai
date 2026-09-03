"""Banderas rojas aplicadas durante la ingesta (RF7).

Todos los casos corren con el modelo caido a proposito: las banderas rojas son
una regla determinista y deben funcionar aunque no haya prediccion.
"""

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.interconsulta import Interconsulta

FIXTURE = Path(__file__).parent / "fixtures" / "interconsultas_banderas_rojas.csv"


def _subir_fixture(client: TestClient):
    with FIXTURE.open("rb") as archivo:
        return client.post(
            "/upload-csv",
            files={"file": ("interconsultas.csv", archivo, "text/csv")},
        )


def test_upload_csv_aplica_banderas_rojas_sin_modelo_disponible(
    client: TestClient,
    db: Session,
    ingesta_sin_modelo: object,
) -> None:
    response = _subir_fixture(client)

    assert response.status_code == 200
    body = response.json()
    assert body["inserted"] == 7
    assert body["prioritized"] == 0
    assert body["prioritization_status"] == "skipped"

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


def test_upload_acepta_archivo_sin_columna_prioridad(
    client: TestClient,
    db: Session,
    ingesta_sin_modelo: object,
) -> None:
    # En produccion la interconsulta llega SIN priorizar: el archivo del sistema
    # hospitalario no trae la columna PRIORIDAD. Exigirla rompia la carga real.
    csv_sin_prioridad = (
        "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,HISTORIA_CLINICA,"
        "FUNDAMENTOS_DIAGNOSTICO,EXAMENES_COMPLEMENTARIOS,MOTIVO_INTERCONSULTA\n"
        "MEDICINA GENERAL,54,MASCULINO,CARDIOLOGIA,"
        "Paciente con dolor toracico de inicio subito,Cuadro agudo,,Evaluacion\n"
    )

    response = client.post(
        "/upload-csv",
        files={"file": ("sin_prioridad.csv", csv_sin_prioridad, "text/csv")},
    )

    assert response.status_code == 200
    assert response.json()["inserted"] == 1

    interconsulta = db.scalar(select(Interconsulta))
    assert interconsulta is not None
    assert interconsulta.prioridad_original_csv is None
    # La bandera roja sigue funcionando sin la columna PRIORIDAD.
    assert interconsulta.bandera_roja is True
    assert interconsulta.prioridad_actual == "alta"


def test_upload_guarda_la_etiqueta_historica_cuando_viene(
    client: TestClient,
    db: Session,
    ingesta_sin_modelo: object,
) -> None:
    # Los archivos historicos si traen PRIORIDAD (la etiqueta del especialista).
    # Se sigue guardando para poder contrastar despues el modelo contra ella.
    response = _subir_fixture(client)

    assert response.status_code == 200

    etiquetas = {
        ic.historia_clinica: ic.prioridad_original_csv
        for ic in db.scalars(select(Interconsulta)).all()
    }
    assert etiquetas["Paciente con dolor toracico de inicio subito"] == "MEDIA"
    assert etiquetas["Paciente sin dolor toracico ni disnea"] == "BAJA"


def test_reevaluar_banderas_no_pisa_decision_medica_previa(
    client: TestClient,
    db: Session,
    ingesta_sin_modelo: object,
) -> None:
    _subir_fixture(client)

    afirmado = db.scalar(
        select(Interconsulta).where(
            Interconsulta.historia_clinica
            == "Paciente con dolor toracico de inicio subito"
        )
    )
    assert afirmado is not None
    interconsulta_id = afirmado.id

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

    db.rollback()
    actualizada = db.get(Interconsulta, interconsulta_id)
    assert actualizada is not None
    assert actualizada.bandera_roja is True
    assert actualizada.prioridad_actual == "media"
    assert actualizada.prioridad_forzada_por_regla is False
