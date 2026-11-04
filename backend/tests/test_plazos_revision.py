"""Plazos de revision por prioridad e interconsultas atrasadas (HDU-22)."""

from collections.abc import Callable
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient

import app.api.interconsultas as interconsultas_api
from app.models.interconsulta import Interconsulta
from app.services.plazos_revision import (
    PLAZO_MAXIMO,
    PLAZOS_POR_DEFECTO,
    dias_de_atraso,
    validar_plazos,
)

CrearInterconsulta = Callable[..., Interconsulta]

HOY = date(2026, 11, 3)


@pytest.fixture
def hoy_fijo(monkeypatch: pytest.MonkeyPatch) -> date:
    """El atraso depende de la fecha de hoy: sin fijarla, estos tests cambian de
    resultado segun el dia en que se corren."""
    monkeypatch.setattr(interconsultas_api, "hoy_chile", lambda: HOY)
    return HOY


# --- Validacion -------------------------------------------------------------


def test_acepta_plazos_crecientes_e_iguales() -> None:
    validar_plazos({"alta": 5, "media": 15, "baja": 30})
    validar_plazos({"alta": 10, "media": 10, "baja": 10})


@pytest.mark.parametrize("dias", [0, -3])
def test_rechaza_plazos_que_no_son_positivos(dias: int) -> None:
    with pytest.raises(
        ValueError, match="prioridad media es inválido: debe ser mayor que 0"
    ):
        validar_plazos({"alta": 5, "media": dias, "baja": 30})


def test_rechaza_un_plazo_sobre_el_maximo() -> None:
    with pytest.raises(ValueError, match=f"no puede superar {PLAZO_MAXIMO}"):
        validar_plazos({"alta": 5, "media": 15, "baja": PLAZO_MAXIMO + 1})


@pytest.mark.parametrize(
    ("plazos", "mensaje"),
    [
        (
            {"alta": 20, "media": 15, "baja": 30},
            "prioridad alta no puede ser mayor que el de prioridad media",
        ),
        (
            {"alta": 5, "media": 40, "baja": 30},
            "prioridad media no puede ser mayor que el de prioridad baja",
        ),
    ],
)
def test_rechaza_una_prioridad_mas_alta_con_mas_dias(
    plazos: dict[str, int], mensaje: str
) -> None:
    with pytest.raises(ValueError, match=mensaje):
        validar_plazos(plazos)


# --- Calculo del atraso -----------------------------------------------------


def test_cuenta_los_dias_por_sobre_el_plazo_desde_la_emision(
    nueva_interconsulta: CrearInterconsulta,
) -> None:
    interconsulta = nueva_interconsulta(
        estado="pendiente",
        prioridad_actual="alta",
        fecha_emision=datetime(2026, 10, 27),
    )

    # 7 dias de espera contra un plazo de 5.
    assert dias_de_atraso(interconsulta, PLAZOS_POR_DEFECTO, HOY) == 2


def test_el_dia_del_plazo_todavia_no_esta_atrasada(
    nueva_interconsulta: CrearInterconsulta,
) -> None:
    """El criterio es "superan el plazo": con 5 dias exactos sigue a tiempo."""
    interconsulta = nueva_interconsulta(
        estado="pendiente",
        prioridad_actual="alta",
        fecha_emision=datetime(2026, 10, 29),
    )

    assert dias_de_atraso(interconsulta, PLAZOS_POR_DEFECTO, HOY) is None


def test_una_revisada_no_esta_atrasada(
    nueva_interconsulta: CrearInterconsulta,
) -> None:
    interconsulta = nueva_interconsulta(
        estado="revisada",
        prioridad_actual="alta",
        fecha_emision=datetime(2026, 1, 1),
    )

    assert dias_de_atraso(interconsulta, PLAZOS_POR_DEFECTO, HOY) is None


def test_sin_prioridad_no_hay_plazo_contra_el_cual_medir(
    nueva_interconsulta: CrearInterconsulta,
) -> None:
    interconsulta = nueva_interconsulta(
        estado="pendiente",
        prioridad_actual=None,
        prioridad_sugerida_modelo=None,
        fecha_emision=datetime(2026, 1, 1),
    )

    assert dias_de_atraso(interconsulta, PLAZOS_POR_DEFECTO, HOY) is None


def test_usa_la_prioridad_actual_antes_que_la_sugerida(
    nueva_interconsulta: CrearInterconsulta,
) -> None:
    """La sugerida es alta (5 dias), pero el medico la dejo en baja (30)."""
    interconsulta = nueva_interconsulta(
        estado="pendiente",
        prioridad_sugerida_modelo="alta",
        prioridad_actual=" Baja ",
        fecha_emision=datetime(2026, 10, 20),
    )

    assert dias_de_atraso(interconsulta, PLAZOS_POR_DEFECTO, HOY) is None


def test_sin_prioridad_actual_usa_la_sugerida(
    nueva_interconsulta: CrearInterconsulta,
) -> None:
    interconsulta = nueva_interconsulta(
        estado="pendiente",
        prioridad_sugerida_modelo="alta",
        prioridad_actual=None,
        fecha_emision=datetime(2026, 10, 20),
    )

    assert dias_de_atraso(interconsulta, PLAZOS_POR_DEFECTO, HOY) == 9


def test_sin_fecha_de_emision_cuenta_desde_el_ingreso_en_hora_de_chile(
    nueva_interconsulta: CrearInterconsulta,
) -> None:
    """Las 02:00 UTC del 29 son las 23:00 del 28 en Chile: contada en UTC, la
    espera salia un dia mas corta."""
    interconsulta = nueva_interconsulta(
        estado="pendiente",
        prioridad_actual="alta",
        fecha_emision=None,
        created_at=datetime(2026, 10, 29, 2, 0),
    )

    assert dias_de_atraso(interconsulta, PLAZOS_POR_DEFECTO, HOY) == 1


def test_sin_ninguna_fecha_no_se_puede_medir(
    nueva_interconsulta: CrearInterconsulta,
) -> None:
    interconsulta = nueva_interconsulta(
        estado="pendiente",
        prioridad_actual="alta",
        fecha_emision=None,
        created_at=None,
    )

    assert dias_de_atraso(interconsulta, PLAZOS_POR_DEFECTO, HOY) is None


# --- API de plazos ----------------------------------------------------------


def test_sin_plazos_definidos_rigen_los_de_fabrica(client: TestClient) -> None:
    response = client.get("/api/plazos-revision")

    assert response.status_code == 200
    assert response.json() == PLAZOS_POR_DEFECTO


def test_el_administrador_guarda_los_plazos(client_admin: TestClient) -> None:
    response = client_admin.put(
        "/api/plazos-revision", json={"alta": 3, "media": 10, "baja": 20}
    )

    assert response.status_code == 200
    assert response.json() == {"alta": 3, "media": 10, "baja": 20}
    assert client_admin.get("/api/plazos-revision").json() == {
        "alta": 3,
        "media": 10,
        "baja": 20,
    }


def test_guardar_dos_veces_actualiza_los_mismos_plazos(
    client_admin: TestClient,
) -> None:
    client_admin.put("/api/plazos-revision", json={"alta": 3, "media": 10, "baja": 20})
    client_admin.put("/api/plazos-revision", json={"alta": 4, "media": 12, "baja": 25})

    assert client_admin.get("/api/plazos-revision").json() == {
        "alta": 4,
        "media": 12,
        "baja": 25,
    }


def test_un_medico_no_puede_cambiar_los_plazos_por_la_api(
    client: TestClient,
) -> None:
    """La interfaz no le muestra el formulario, pero eso no impide llamar a la
    API directamente: la restriccion tiene que estar en el backend."""
    response = client.put(
        "/api/plazos-revision", json={"alta": 1, "media": 1, "baja": 1}
    )

    assert response.status_code == 403
    assert client.get("/api/plazos-revision").json() == PLAZOS_POR_DEFECTO


def test_rechaza_plazos_desordenados_sin_guardar_nada(
    client_admin: TestClient,
) -> None:
    response = client_admin.put(
        "/api/plazos-revision", json={"alta": 20, "media": 15, "baja": 30}
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "El plazo de prioridad alta no puede ser mayor que el de prioridad media"
    )
    assert client_admin.get("/api/plazos-revision").json() == PLAZOS_POR_DEFECTO


@pytest.mark.parametrize("dias", [5.5, "5", 5.0, None])
def test_rechaza_plazos_que_no_son_enteros(
    client_admin: TestClient, dias: object
) -> None:
    response = client_admin.put(
        "/api/plazos-revision", json={"alta": dias, "media": 15, "baja": 30}
    )

    assert response.status_code == 422


# --- Atraso en las interconsultas ------------------------------------------


def test_el_listado_marca_las_atrasadas(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    hoy_fijo: date,
) -> None:
    guardar_interconsulta(
        id="ic-atrasada",
        estado="pendiente",
        prioridad_actual="alta",
        fecha_emision=datetime(2026, 10, 20),
    )
    guardar_interconsulta(
        id="ic-a-tiempo",
        estado="pendiente",
        prioridad_actual="baja",
        fecha_emision=datetime(2026, 10, 20),
    )

    response = client.get("/api/interconsultas")

    assert response.status_code == 200
    por_id = {ic["id"]: ic for ic in response.json()}
    assert por_id["ic-atrasada"]["atrasada"] is True
    assert por_id["ic-atrasada"]["dias_atraso"] == 9
    assert por_id["ic-a-tiempo"]["atrasada"] is False
    assert por_id["ic-a-tiempo"]["dias_atraso"] is None


def test_el_detalle_trae_el_atraso(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    hoy_fijo: date,
) -> None:
    guardar_interconsulta(
        id="ic-detalle-atraso",
        estado="pendiente",
        prioridad_actual="media",
        fecha_emision=datetime(2026, 10, 1),
    )

    body = client.get("/api/interconsultas/ic-detalle-atraso").json()

    assert body["atrasada"] is True
    assert body["dias_atraso"] == 18


def test_un_plazo_nuevo_rige_de_inmediato_para_las_pendientes(
    client: TestClient,
    client_admin: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    hoy_fijo: date,
) -> None:
    """Sin cargar datos nuevos: el atraso se recalcula en la siguiente lectura."""
    guardar_interconsulta(
        id="ic-plazo-nuevo",
        estado="pendiente",
        prioridad_actual="alta",
        fecha_emision=datetime(2026, 10, 27),
    )
    assert client.get("/api/interconsultas/ic-plazo-nuevo").json()["atrasada"] is True

    client_admin.put("/api/plazos-revision", json={"alta": 10, "media": 15, "baja": 30})
    assert client.get("/api/interconsultas/ic-plazo-nuevo").json()["atrasada"] is False

    client_admin.put("/api/plazos-revision", json={"alta": 2, "media": 15, "baja": 30})
    body = client.get("/api/interconsultas/ic-plazo-nuevo").json()
    assert body["atrasada"] is True
    assert body["dias_atraso"] == 5


def test_marcarla_revisada_le_quita_el_atraso(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    hoy_fijo: date,
) -> None:
    guardar_interconsulta(
        id="ic-revisar",
        estado="pendiente",
        prioridad_actual="alta",
        fecha_emision=datetime(2026, 10, 1),
    )

    response = client.patch(
        "/api/interconsultas/ic-revisar/estado", json={"estado": "revisada"}
    )

    assert response.status_code == 200
    assert response.json()["atrasada"] is False
    assert client.get("/api/interconsultas/ic-revisar").json()["atrasada"] is False


def test_cambiar_la_prioridad_mide_el_atraso_con_el_plazo_nuevo(
    client: TestClient,
    guardar_interconsulta: CrearInterconsulta,
    hoy_fijo: date,
) -> None:
    """El cambio de prioridad responde con el atraso de la prioridad nueva. En
    la interfaz, ademas, el cambio marca la interconsulta como revisada."""
    guardar_interconsulta(
        id="ic-cambio",
        estado="pendiente",
        prioridad_actual="alta",
        fecha_emision=datetime(2026, 10, 20),
    )

    response = client.patch(
        "/api/interconsultas/ic-cambio/prioridad",
        json={"prioridad": "baja", "motivo": "Cuadro estable en control"},
    )

    assert response.status_code == 200
    assert response.json()["atrasada"] is False
