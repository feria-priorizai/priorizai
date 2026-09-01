"""Funciones puras de `app/main.py` usadas por la ingesta.

`_parsear_fecha_emision` es la que ordena el listado en HU3-c1 y no tenia ningun
test: un formato mal parseado no rompe la carga, devuelve None en silencio y la
interconsulta cae al final de la lista.
"""

from datetime import UTC, datetime

import pytest

from app.main import (
    _estado_priorizacion,
    _normalizar_encabezado,
    _normalizar_valor,
    _parsear_fecha_emision,
    _texto_o_none,
)
from app.models.interconsulta import Interconsulta
from app.services.priorizador import tiene_informacion_clinica

# --------------------------------------------------------------------------
# _parsear_fecha_emision
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("2026-03-15", datetime(2026, 3, 15, tzinfo=UTC)),
        ("15-03-2026", datetime(2026, 3, 15, tzinfo=UTC)),
        ("15/03/2026", datetime(2026, 3, 15, tzinfo=UTC)),
        ("  2026-03-15  ", datetime(2026, 3, 15, tzinfo=UTC)),
    ],
)
def test_parsear_fecha_emision_acepta_los_formatos_conocidos(
    entrada: str, esperado: datetime
) -> None:
    assert _parsear_fecha_emision(entrada) == esperado


@pytest.mark.parametrize(
    "entrada",
    [
        None,
        "",
        "   ",
        "15.03.2026",
        "2026/03/15",
        "marzo 2026",
        "no es una fecha",
        "2026-13-45",
    ],
)
def test_parsear_fecha_emision_devuelve_none_si_no_reconoce_el_formato(
    entrada: object,
) -> None:
    # D18: aun no se conoce el formato real del archivo del sistema hospitalario,
    # asi que una fecha rara no debe romper la carga completa.
    assert _parsear_fecha_emision(entrada) is None


def test_parsear_fecha_emision_distingue_dia_de_mes() -> None:
    # "%d-%m-%Y" antes que cualquier lectura al reves: 03-04 es 3 de abril.
    assert _parsear_fecha_emision("03-04-2026") == datetime(2026, 4, 3, tzinfo=UTC)


def test_parsear_fecha_emision_devuelve_fecha_con_zona_utc() -> None:
    fecha = _parsear_fecha_emision("2026-03-15")

    assert fecha is not None
    assert fecha.tzinfo is UTC


# --------------------------------------------------------------------------
# _normalizar_valor / _normalizar_encabezado
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        (None, ""),
        ("  texto  ", "texto"),
        ("﻿ESPEC_ORIGEN", "ESPEC_ORIGEN"),
        ("dato\xa0con\xa0nbsp", "dato con nbsp"),
        (46, "46"),
        (46.0, "46"),
        (46.5, "46.5"),
        (True, "True"),
    ],
)
def test_normalizar_valor(entrada: object, esperado: str) -> None:
    assert _normalizar_valor(entrada) == esperado


def test_normalizar_valor_convierte_el_float_entero_de_xlsx() -> None:
    # openpyxl entrega los numeros como float: sin esto EDAD llegaria como "46.0"
    # y la conversion a int fallaria, rechazando una fila valida.
    assert _normalizar_valor(46.0) == "46"
    assert int(_normalizar_valor(46.0)) == 46


def test_normalizar_encabezado_pasa_a_mayusculas() -> None:
    assert _normalizar_encabezado("  espec_origen ") == "ESPEC_ORIGEN"
    assert _normalizar_encabezado("﻿Edad") == "EDAD"


# --------------------------------------------------------------------------
# _texto_o_none
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        (None, None),
        ("", None),
        ("   ", None),
        ("ALTA", "ALTA"),
        ("  ALTA  ", "ALTA"),
    ],
)
def test_texto_o_none(entrada: object, esperado: str | None) -> None:
    assert _texto_o_none(entrada) == esperado


# --------------------------------------------------------------------------
# _estado_priorizacion
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("total", "priorizadas", "esperado"),
    [
        (3, 3, "completed"),
        (3, 0, "skipped"),
        (3, 1, "partial"),
        (3, 2, "partial"),
        (0, 0, "completed"),
    ],
)
def test_estado_priorizacion(total: int, priorizadas: int, esperado: str) -> None:
    assert _estado_priorizacion(total=total, priorizadas=priorizadas) == esperado


# --------------------------------------------------------------------------
# _tiene_informacion_clinica
# --------------------------------------------------------------------------


def _interconsulta(**campos: object) -> Interconsulta:
    valores: dict[str, object] = {
        "id": "ic-info",
        "espec_origen": "Medicina General",
        "edad": 50,
        "sexo": "F",
        "espec_destino": "Cardiologia",
        "historia_clinica": "",
        "fundamentos_diagnostico": "",
        "examenes_complementarios": "",
        "motivo_interconsulta": "",
    }
    valores.update(campos)
    return Interconsulta(**valores)


@pytest.mark.parametrize(
    "campo",
    [
        "historia_clinica",
        "fundamentos_diagnostico",
        "examenes_complementarios",
        "motivo_interconsulta",
    ],
)
def test_tiene_informacion_clinica_basta_con_un_campo(campo: str) -> None:
    assert tiene_informacion_clinica(_interconsulta(**{campo: "algo"})) is True


def test_tiene_informacion_clinica_es_false_con_todo_vacio() -> None:
    assert tiene_informacion_clinica(_interconsulta()) is False


def test_tiene_informacion_clinica_ignora_los_espacios() -> None:
    assert tiene_informacion_clinica(_interconsulta(historia_clinica="   ")) is False


def test_tiene_informacion_clinica_tolera_none() -> None:
    interconsulta = _interconsulta(
        historia_clinica=None,
        fundamentos_diagnostico=None,
        examenes_complementarios=None,
        motivo_interconsulta=None,
    )

    assert tiene_informacion_clinica(interconsulta) is False
