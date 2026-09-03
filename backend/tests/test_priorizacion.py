from collections.abc import Callable
from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.interconsulta import Interconsulta

CrearInterconsulta = Callable[..., Interconsulta]
Releer = Callable[[str], Interconsulta | None]


def test_priorizar_interconsultas_actualiza_resultado_modelo(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    releer: Releer,
) -> None:
    guardar_interconsulta(
        id="ic-001",
        edad=67,
        sexo="M",
        prioridad_original_csv="Alta",
        historia_clinica="HTA DM2 insuficiencia cardiaca",
        fundamentos_diagnostico="Disnea progresiva",
        examenes_complementarios="Eco FEVI 35%",
        motivo_interconsulta="Evaluacion cardiologica urgente",
    )

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

    actualizada = releer("ic-001")
    assert actualizada is not None
    assert actualizada.prioridad_sugerida_modelo == "alta"
    assert actualizada.confianza_modelo == 91.5
    assert actualizada.prob_baja == 2.0
    assert actualizada.prob_media == 6.5
    assert actualizada.prob_alta == 91.5
    assert actualizada.prioridad_actual == "alta"


def test_priorizar_interconsultas_retorna_404_si_falta_id(client: TestClient) -> None:
    response = client.post("/api/interconsultas/priorizar", json={"ids": ["ic-x"]})

    assert response.status_code == 404
    assert response.json()["detail"] == {"interconsultas_no_encontradas": ["ic-x"]}


def test_priorizar_interconsulta_invalida_retorna_422(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(
        id="ic-invalida",
        historia_clinica="",
        fundamentos_diagnostico="",
        examenes_complementarios="",
        motivo_interconsulta="",
    )

    response = client.post(
        "/api/interconsultas/priorizar",
        json={"ids": ["ic-invalida"]},
    )

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "informacion clinica suficiente" in detail["message"]
    assert detail["interconsultas_invalidas"] == ["ic-invalida"]


def test_priorizar_devuelve_503_cuando_el_modelo_no_esta_disponible(
    client_sin_modelo: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-sin-modelo")

    response = client_sin_modelo.post(
        "/api/interconsultas/priorizar",
        json={"ids": ["ic-sin-modelo"]},
    )

    assert response.status_code == 503
    assert "No se pudo ejecutar el modelo predictivo" in response.json()["detail"]


def test_priorizar_pendientes_devuelve_503_cuando_el_modelo_falla(
    client_sin_modelo: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-pendiente-sin-modelo")

    response = client_sin_modelo.post("/api/interconsultas/priorizar-pendientes")

    assert response.status_code == 503


def test_priorizar_interconsultas_pendientes_respeta_limit(
    client: TestClient,
    db: Session,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    for index in range(3):
        guardar_interconsulta(id=f"ic-p-{index}", edad=50 + index)
    guardar_interconsulta(
        id="ic-ya-priorizada",
        prioridad_sugerida_modelo="media",
        confianza_modelo=80.0,
    )

    response = client.post("/api/interconsultas/priorizar-pendientes?limit=2")

    assert response.status_code == 200
    assert response.json()["total"] == 2

    db.rollback()
    priorizadas = (
        db.query(Interconsulta)
        .filter(Interconsulta.prioridad_sugerida_modelo == "alta")
        .count()
    )
    ya_priorizada = db.get(Interconsulta, "ic-ya-priorizada")
    assert priorizadas == 2
    assert ya_priorizada is not None
    assert ya_priorizada.prioridad_sugerida_modelo == "media"


def test_priorizar_pendientes_omite_interconsultas_invalidas(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-p-valida", historia_clinica="Dolor toracico")
    guardar_interconsulta(
        id="ic-p-invalida",
        historia_clinica="",
        fundamentos_diagnostico="",
        examenes_complementarios="",
        motivo_interconsulta="",
    )

    response = client.post("/api/interconsultas/priorizar-pendientes?limit=10")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["resultados"][0]["id"] == "ic-p-valida"


def test_priorizar_pendientes_omite_interconsultas_con_espacios(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(
        id="ic-p-espacios",
        historia_clinica="   ",
        fundamentos_diagnostico="",
        examenes_complementarios="",
        motivo_interconsulta="",
    )

    response = client.post("/api/interconsultas/priorizar-pendientes?limit=10")

    assert response.status_code == 200
    assert response.json() == {"total": 0, "resultados": []}


def test_listado_ordena_por_prioridad_y_fecha_de_emision(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    # HU3-c1: prioridad descendente y, dentro de cada prioridad, fecha de
    # emision ascendente. HU3-c3: ante empate, orden estable por id.
    casos = [
        ("ic-b", "baja", datetime(2026, 1, 1)),
        ("ic-a2", "alta", datetime(2026, 3, 1)),
        ("ic-m", "media", datetime(2026, 2, 1)),
        ("ic-a1", "alta", datetime(2026, 1, 15)),
    ]
    for identificador, prioridad, fecha in casos:
        guardar_interconsulta(
            id=identificador,
            prioridad_original_csv=prioridad,
            prioridad_actual=prioridad,
            fecha_emision=fecha,
        )

    response = client.get("/api/interconsultas")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    # alta (mas antigua primero) -> media -> baja
    assert ids == ["ic-a1", "ic-a2", "ic-m", "ic-b"]


def test_listado_ignora_la_etiqueta_historica_al_ordenar(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    # prioridad_original_csv es la etiqueta del corpus historico, no una prioridad
    # de esta aplicacion. No debe influir en el orden ni sustituir a la prioridad
    # que produce el sistema: si el modelo no priorizo y el medico no decidio, la
    # interconsulta no tiene prioridad, venga o no con etiqueta.
    guardar_interconsulta(
        id="ic-etiqueta-alta",
        prioridad_original_csv="ALTA",
        prioridad_actual=None,
        prioridad_sugerida_modelo=None,
    )
    guardar_interconsulta(
        id="ic-modelo-media",
        prioridad_original_csv=None,
        prioridad_actual=None,
        prioridad_sugerida_modelo="media",
    )

    response = client.get("/api/interconsultas")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    # La que tiene sugerencia del modelo va primero; la que solo trae etiqueta
    # historica cuenta como sin prioridad y queda al final.
    assert ids == ["ic-modelo-media", "ic-etiqueta-alta"]


def test_listado_ubica_al_final_las_interconsultas_sin_prioridad(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-con-prioridad", prioridad_actual="baja")
    guardar_interconsulta(id="ic-sin-prioridad", prioridad_actual=None)

    response = client.get("/api/interconsultas")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert ids == ["ic-con-prioridad", "ic-sin-prioridad"]


def test_priorizar_no_pisa_prioridad_forzada_por_bandera_roja(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    releer: Releer,
) -> None:
    # Regresion: PriorizadorFake sugiere "alta", pero con una bandera roja la
    # prioridad forzada debe mantenerse aunque el modelo sugiera otra cosa
    # (HU5-c3 / D5). La sugerencia del modelo igual queda registrada.
    guardar_interconsulta(
        id="ic-bandera",
        historia_clinica="Paciente con dolor toracico de inicio subito",
        prioridad_actual="alta",
        bandera_roja=True,
        terminos_bandera_roja="dolor_toracico",
        prioridad_forzada_por_regla=True,
    )

    response = client.post(
        "/api/interconsultas/priorizar", json={"ids": ["ic-bandera"]}
    )

    assert response.status_code == 200

    actualizada = releer("ic-bandera")
    assert actualizada is not None
    assert actualizada.prioridad_actual == "alta"
    assert actualizada.prioridad_forzada_por_regla is True
    assert actualizada.bandera_roja is True
    assert actualizada.prioridad_sugerida_modelo == "alta"


def test_priorizar_limpia_motivo_sin_prioridad_previo(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    releer: Releer,
) -> None:
    # Si una carga anterior fallo por falta de modelo, el motivo queda guardado.
    # Al priorizar con exito debe limpiarse para no dejar un mensaje obsoleto.
    guardar_interconsulta(
        id="ic-motivo-obsoleto",
        motivo_sin_prioridad="No se pudo ejecutar el modelo predictivo: simulado",
    )

    response = client.post(
        "/api/interconsultas/priorizar",
        json={"ids": ["ic-motivo-obsoleto"]},
    )

    assert response.status_code == 200

    actualizada = releer("ic-motivo-obsoleto")
    assert actualizada is not None
    assert actualizada.motivo_sin_prioridad is None
    assert actualizada.prioridad_actual == "alta"


def test_modificar_prioridad_persiste_historial(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    releer: Releer,
) -> None:
    guardar_interconsulta(id="ic-mod-001", prioridad_actual="media")

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

    actualizada = releer("ic-mod-001")
    assert actualizada is not None
    assert actualizada.prioridad_actual == "alta"


def test_modificar_prioridad_rechaza_motivo_vacio(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-mod-002", prioridad_actual="media")

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


def test_modificar_estado_persiste_revision(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    releer: Releer,
) -> None:
    guardar_interconsulta(
        id="ic-estado-001",
        prioridad_actual="media",
        estado="pendiente",
    )

    response = client.patch(
        "/api/interconsultas/ic-estado-001/estado",
        json={"estado": "revisada"},
    )

    assert response.status_code == 200
    assert response.json()["estado"] == "revisada"

    actualizada = releer("ic-estado-001")
    assert actualizada is not None
    assert actualizada.estado == "revisada"
