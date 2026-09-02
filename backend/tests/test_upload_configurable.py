"""Campos obligatorios configurables desde la pestana de configuracion.

Antes el frontend mandaba solo el archivo y el backend validaba contra sus
propias listas fijas: desmarcar un campo en la configuracion no tenia ningun
efecto sobre la carga.
"""

from fastapi.testclient import TestClient

from app.main import (
    COLUMNAS_OBLIGATORIAS_POR_FILA,
    _resolver_obligatorias,
)

HEADER = (
    "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,HISTORIA_CLINICA,"
    "FUNDAMENTOS_DIAGNOSTICO,EXAMENES_COMPLEMENTARIOS,MOTIVO_INTERCONSULTA\n"
)
FILA = (
    "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,"
    "CANCER PULMONAR,Paciente estable.,,CONTROL DE ESPECIALIDAD\n"
)
SIN_MOTIVO = (
    "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,"
    "CANCER PULMONAR,Paciente estable.,,\n"
)


def _subir(client: TestClient, contenido: str, campos: str | None = None):
    data = {"campos_obligatorios": campos} if campos is not None else None
    return client.post(
        "/upload-csv",
        files={"file": ("carga.csv", contenido, "text/csv")},
        data=data,
    )


# --------------------------------------------------------------------------
# _resolver_obligatorias
# --------------------------------------------------------------------------


def test_sin_configuracion_se_usan_los_de_fabrica() -> None:
    assert _resolver_obligatorias(None) == COLUMNAS_OBLIGATORIAS_POR_FILA


def test_la_configuracion_reemplaza_la_lista() -> None:
    assert _resolver_obligatorias("ESPEC_ORIGEN,SEXO") == [
        "ESPEC_ORIGEN",
        "SEXO",
        "EDAD",
    ]


def test_edad_se_agrega_siempre() -> None:
    """La columna es NOT NULL y no tiene un vacio que guardar."""
    assert "EDAD" in _resolver_obligatorias("SEXO")


def test_las_claves_que_no_son_columnas_del_archivo_se_ignoran() -> None:
    """La pestana ofrece campos que solo existen al exportar (ID, ESTADO...)."""
    assert _resolver_obligatorias("SEXO,PRIORIDAD_ACTUAL,ID,ESTADO") == [
        "SEXO",
        "EDAD",
    ]


def test_la_lista_vacia_deja_solo_lo_imprescindible() -> None:
    assert _resolver_obligatorias("") == ["EDAD"]


def test_se_normalizan_minusculas_y_espacios() -> None:
    assert _resolver_obligatorias(" sexo , Espec_Origen ") == [
        "SEXO",
        "ESPEC_ORIGEN",
        "EDAD",
    ]


# --------------------------------------------------------------------------
# Efecto sobre la carga
# --------------------------------------------------------------------------


def test_sin_configuracion_la_fila_sin_motivo_se_rechaza(
    client: TestClient,
    ingesta_con_modelo: object,
) -> None:
    response = _subir(client, HEADER + SIN_MOTIVO)

    assert response.status_code == 200
    body = response.json()
    assert body["inserted"] == 0
    assert body["rejected"][0]["campos_faltantes"] == ["MOTIVO_INTERCONSULTA"]


def test_si_el_motivo_deja_de_ser_obligatorio_la_fila_entra(
    client: TestClient,
    ingesta_con_modelo: object,
) -> None:
    response = _subir(
        client,
        HEADER + SIN_MOTIVO,
        campos="ESPEC_ORIGEN,SEXO,ESPEC_DESTINO,HISTORIA_CLINICA",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["inserted"] == 1
    assert body["rejected_count"] == 0


def test_la_edad_sigue_siendo_obligatoria_aunque_no_se_configure(
    client: TestClient,
    ingesta_con_modelo: object,
) -> None:
    sin_edad = FILA.replace(",46,", ",,")

    response = _subir(client, HEADER + sin_edad, campos="ESPEC_ORIGEN")

    assert response.status_code == 200
    body = response.json()
    assert body["inserted"] == 0
    assert body["rejected"][0]["campos_faltantes"] == ["EDAD"]


def test_el_encabezado_se_exige_segun_la_configuracion(
    client: TestClient,
    ingesta_con_modelo: object,
) -> None:
    """Un archivo sin la columna de motivo entra si el motivo no es obligatorio."""
    header = (
        "ESPEC_ORIGEN,EDAD,SEXO,ESPEC_DESTINO,HISTORIA_CLINICA,"
        "FUNDAMENTOS_DIAGNOSTICO\n"
    )
    fila = "MEDICINA GENERAL,46,FEMENINO,RESPIRATORIO ADULTO,CANCER,Estable.\n"

    rechazado = _subir(client, header + fila)
    assert rechazado.status_code == 400
    assert "MOTIVO_INTERCONSULTA" in rechazado.json()["detail"]

    aceptado = _subir(
        client,
        header + fila,
        campos="ESPEC_ORIGEN,SEXO,ESPEC_DESTINO,HISTORIA_CLINICA",
    )
    assert aceptado.status_code == 200
    assert aceptado.json()["inserted"] == 1
