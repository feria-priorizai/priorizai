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
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "La prioridad debe ser alta, media o baja"


def test_el_medico_responsable_sale_de_la_sesion_y_no_del_cuerpo(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """Si el nombre lo mandara el cliente, cualquiera podria firmar un cambio de
    prioridad a nombre de otro medico."""
    guardar_interconsulta(id="ic-firma", prioridad_actual="media")

    response = client.patch(
        "/api/interconsultas/ic-firma/prioridad",
        json={
            "prioridad": "alta",
            "motivo": "Motivo valido",
            "medico_responsable": "Dr. Suplantado",
        },
    )

    assert response.status_code == 200
    modificacion = response.json()["modificaciones"][0]
    assert modificacion["medico_responsable"] == "Dra. Test"


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


def test_listado_publica_el_total_real_en_la_cabecera(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """Regresion: el cliente pedia una pagina fija y mostraba su tamano como si
    fuera el total, asi que el resto de la lista de espera desaparecia."""
    for indice in range(7):
        guardar_interconsulta(id=f"ic-pag-{indice}")

    response = client.get("/api/interconsultas", params={"limit": 3})

    assert response.status_code == 200
    assert len(response.json()) == 3
    assert response.headers["X-Total-Count"] == "7"


def test_listado_pagina_sin_repetir_ni_perder_filas(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    for indice in range(5):
        guardar_interconsulta(id=f"ic-pag-{indice}")

    primera = client.get("/api/interconsultas", params={"limit": 2, "offset": 0})
    segunda = client.get("/api/interconsultas", params={"limit": 2, "offset": 2})
    tercera = client.get("/api/interconsultas", params={"limit": 2, "offset": 4})

    ids = [
        interconsulta["id"]
        for pagina in (primera, segunda, tercera)
        for interconsulta in pagina.json()
    ]

    assert len(ids) == 5
    assert len(set(ids)) == 5


def test_listado_sin_filas_reporta_total_cero(client: TestClient) -> None:
    response = client.get("/api/interconsultas")

    assert response.json() == []
    assert response.headers["X-Total-Count"] == "0"


def test_listado_rechaza_un_limit_desmedido(client: TestClient) -> None:
    """Sin tope, un `?limit=999999` traia la tabla entera."""
    assert (
        client.get("/api/interconsultas", params={"limit": 999999}).status_code == 422
    )
    assert client.get("/api/interconsultas", params={"limit": 0}).status_code == 422


def test_motivo_demasiado_corto_devuelve_422(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """El minimo vivia solo en el formulario del frontend: por la API entraba un
    motivo de un caracter, y el motivo es toda la auditoria de HdU02."""
    guardar_interconsulta(id="ic-motivo-corto")

    response = client.patch(
        "/api/interconsultas/ic-motivo-corto/prioridad",
        json={
            "prioridad": "alta",
            "motivo": "corto",
        },
    )

    assert response.status_code == 422
    assert "al menos 10" in response.json()["detail"]


def test_motivo_en_el_limite_se_acepta(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    guardar_interconsulta(id="ic-motivo-limite")

    response = client.patch(
        "/api/interconsultas/ic-motivo-limite/prioridad",
        json={
            "prioridad": "alta",
            "motivo": "10 chars!!",
        },
    )

    assert response.status_code == 200


# --- Tests para filtrado por especialidad (HDU-5) ---


def test_listado_filtra_por_especialidad_del_medico(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """El medico solo ve interconsultas de su especialidad (Cardiologia)."""
    # Una de su especialidad
    guardar_interconsulta(id="ic-cardio", espec_destino="Cardiologia")
    # De otra especialidad
    guardar_interconsulta(id="ic-neuro", espec_destino="Neurologia")

    response = client.get("/api/interconsultas")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == "ic-cardio"
    assert body[0]["espec_destino"] == "Cardiologia"
    # Total count en cabecera tambien debe reflejar el filtro
    assert response.headers["X-Total-Count"] == "1"


def test_listado_admin_ve_todas_las_especialidades(
    client_admin: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """El administrador ve interconsultas de todas las especialidades."""
    guardar_interconsulta(id="ic-cardio", espec_destino="Cardiologia")
    guardar_interconsulta(id="ic-neuro", espec_destino="Neurologia")
    guardar_interconsulta(id="ic-derma", espec_destino="Dermatologia")

    response = client_admin.get("/api/interconsultas")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    assert response.headers["X-Total-Count"] == "3"


def test_medico_no_ve_interconsulta_de_otra_especialidad_devuelve_404(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """GET /api/interconsultas/{id} devuelve 404 si la especialidad no coincide."""
    guardar_interconsulta(id="ic-neuro", espec_destino="Neurologia")

    response = client.get("/api/interconsultas/ic-neuro")

    assert response.status_code == 404
    assert response.json()["detail"] == "Interconsulta no encontrada"


def test_admin_ve_interconsulta_de_cualquier_especialidad(
    client_admin: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """GET /api/interconsultas/{id} funciona para admin sin importar especialidad."""
    guardar_interconsulta(id="ic-neuro", espec_destino="Neurologia")

    response = client_admin.get("/api/interconsultas/ic-neuro")

    assert response.status_code == 200
    assert response.json()["id"] == "ic-neuro"


def test_medico_no_puede_modificar_prioridad_de_otra_especialidad(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """PATCH /prioridad devuelve 404 si la especialidad no coincide."""
    guardar_interconsulta(
        id="ic-neuro", espec_destino="Neurologia", prioridad_actual="media"
    )

    response = client.patch(
        "/api/interconsultas/ic-neuro/prioridad",
        json={"prioridad": "alta", "motivo": "Motivo valido"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Interconsulta no encontrada"


def test_admin_puede_modificar_prioridad_de_cualquier_especialidad(
    client_admin: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """PATCH /prioridad funciona para admin sin importar especialidad."""
    guardar_interconsulta(
        id="ic-neuro", espec_destino="Neurologia", prioridad_actual="media"
    )

    response = client_admin.patch(
        "/api/interconsultas/ic-neuro/prioridad",
        json={"prioridad": "alta", "motivo": "Motivo valido"},
    )

    assert response.status_code == 200
    assert response.json()["prioridad_actual"] == "alta"


def test_medico_no_puede_modificar_estado_de_otra_especialidad(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """PATCH /estado devuelve 404 si la especialidad no coincide."""
    guardar_interconsulta(id="ic-neuro", espec_destino="Neurologia", estado="pendiente")

    response = client.patch(
        "/api/interconsultas/ic-neuro/estado",
        json={"estado": "revisada"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Interconsulta no encontrada"


def test_admin_puede_modificar_estado_de_cualquier_especialidad(
    client_admin: TestClient,
    guardar_interconsulta: CrearInterconsulta,
) -> None:
    """PATCH /estado funciona para admin sin importar especialidad."""
    guardar_interconsulta(id="ic-neuro", espec_destino="Neurologia", estado="pendiente")

    response = client_admin.patch(
        "/api/interconsultas/ic-neuro/estado",
        json={"estado": "revisada"},
    )

    assert response.status_code == 200
    assert response.json()["estado"] == "revisada"
