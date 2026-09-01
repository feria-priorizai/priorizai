"""Ramas de error y endpoints de `app/api/interconsultas.py` sin cubrir.

`GET /api/interconsultas/{id}` es el endpoint del que depende la pagina de
detalle del frontend y no tenia ningun test.
"""

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.models.interconsulta import Interconsulta

CrearInterconsulta = Callable[..., Interconsulta]


def test_obtener_interconsulta_devuelve_el_detalle(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(
        id="ic-detalle",
        espec_origen="Medicina General",
        edad=67,
        sexo="M",
        espec_destino="Cardiologia",
        historia_clinica="HTA DM2",
        motivo_interconsulta="Evaluacion cardiologica",
        prioridad_actual="alta",
        estado="pendiente",
    )

    response = client.get("/api/interconsultas/ic-detalle")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "ic-detalle"
    assert body["edad"] == 67
    assert body["sexo"] == "M"
    assert body["espec_destino"] == "Cardiologia"
    assert body["historia_clinica"] == "HTA DM2"
    assert body["prioridad_actual"] == "alta"
    assert body["estado"] == "pendiente"
    assert body["modificaciones"] == []


def test_obtener_interconsulta_incluye_las_modificaciones(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-detalle-mod", prioridad_actual="media")
    client.patch(
        "/api/interconsultas/ic-detalle-mod/prioridad",
        json={
            "prioridad": "alta",
            "motivo": "Empeora el cuadro",
            "medico_responsable": "Dra. Test",
        },
    )

    response = client.get("/api/interconsultas/ic-detalle-mod")

    assert response.status_code == 200
    body = response.json()
    assert body["prioridad_actual"] == "alta"
    assert len(body["modificaciones"]) == 1
    assert body["modificaciones"][0]["prioridad_anterior"] == "media"


def test_obtener_interconsulta_inexistente_devuelve_404(client: TestClient) -> None:
    response = client.get("/api/interconsultas/no-existe")

    assert response.status_code == 404
    assert response.json()["detail"] == "Interconsulta no encontrada"


def test_modificar_prioridad_de_interconsulta_inexistente_devuelve_404(
    client: TestClient,
) -> None:
    response = client.patch(
        "/api/interconsultas/no-existe/prioridad",
        json={
            "prioridad": "alta",
            "motivo": "Motivo valido",
            "medico_responsable": "Dra. Test",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Interconsulta no encontrada"


def test_modificar_estado_de_interconsulta_inexistente_devuelve_404(
    client: TestClient,
) -> None:
    response = client.patch(
        "/api/interconsultas/no-existe/estado",
        json={"estado": "revisada"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Interconsulta no encontrada"


def test_modificar_prioridad_rechaza_prioridad_invalida(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-prioridad-invalida", prioridad_actual="media")

    response = client.patch(
        "/api/interconsultas/ic-prioridad-invalida/prioridad",
        json={
            "prioridad": "urgentisima",
            "motivo": "Motivo valido",
            "medico_responsable": "Dra. Test",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "La prioridad debe ser alta, media o baja"


def test_modificar_prioridad_rechaza_medico_responsable_vacio(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-sin-medico", prioridad_actual="media")

    response = client.patch(
        "/api/interconsultas/ic-sin-medico/prioridad",
        json={
            "prioridad": "alta",
            "motivo": "Motivo valido",
            "medico_responsable": "   ",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "El medico responsable es obligatorio"


def test_modificar_estado_rechaza_estado_invalido(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-estado-invalido")

    response = client.patch(
        "/api/interconsultas/ic-estado-invalido/estado",
        json={"estado": "archivada"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "El estado debe ser pendiente o revisada"


def test_modificar_prioridad_acepta_prioridad_con_mayusculas_y_espacios(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    releer: Callable[[str], Interconsulta | None],
) -> None:
    guardar_interconsulta(id="ic-normaliza", prioridad_actual="baja")

    response = client.patch(
        "/api/interconsultas/ic-normaliza/prioridad",
        json={
            "prioridad": "  ALTA  ",
            "motivo": "Motivo valido",
            "medico_responsable": "Dra. Test",
        },
    )

    assert response.status_code == 200
    actualizada = releer("ic-normaliza")
    assert actualizada is not None
    assert actualizada.prioridad_actual == "alta"


def test_listado_respeta_offset_y_limit(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    for indice in range(3):
        guardar_interconsulta(id=f"ic-pag-{indice}", prioridad_actual="alta")

    response = client.get("/api/interconsultas?limit=1&offset=1")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert ids == ["ic-pag-1"]


def test_reevaluar_banderas_sin_interconsultas_devuelve_totales_en_cero(
    client: TestClient,
) -> None:
    response = client.post("/api/interconsultas/reevaluar-banderas")

    assert response.status_code == 200
    assert response.json() == {"total_evaluadas": 0, "total_con_bandera_roja": 0}


def test_reevaluar_banderas_marca_las_que_tienen_termino_de_alarma(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    releer: Callable[[str], Interconsulta | None],
) -> None:
    guardar_interconsulta(
        id="ic-con-alarma",
        historia_clinica="Paciente con dolor toracico de inicio subito",
    )
    guardar_interconsulta(
        id="ic-sin-alarma",
        historia_clinica="Control sano sin hallazgos relevantes",
        fundamentos_diagnostico="Rutina",
        motivo_interconsulta="Control",
    )

    response = client.post("/api/interconsultas/reevaluar-banderas")

    assert response.status_code == 200
    assert response.json() == {"total_evaluadas": 2, "total_con_bandera_roja": 1}

    con_alarma = releer("ic-con-alarma")
    assert con_alarma is not None
    assert con_alarma.bandera_roja is True
    assert con_alarma.prioridad_actual == "alta"
