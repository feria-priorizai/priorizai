"""Lectura de archivos con interconsultas ya priorizadas para reentrenar."""

import io
import json
from collections.abc import Sequence

import pytest
from openpyxl import Workbook

from app.models.interconsulta import Interconsulta
from app.services.datos_entrenamiento import (
    MAXIMO_RECHAZOS_DETALLE,
    ArchivoDatosInvalidoError,
    leer_archivo,
)
from app.services.priorizador import construir_texto

ENCABEZADO = [
    "ESPEC_ORIGEN",
    "EDAD",
    "SEXO",
    "ESPEC_DESTINO",
    "HISTORIA_CLINICA",
    "FUNDAMENTOS_DIAGNOSTICO",
    "EXAMENES_COMPLEMENTARIOS",
    "MOTIVO_INTERCONSULTA",
    "PRIORIDAD",
]
FILA = [
    "Medicina General",
    50,
    "F",
    "Cardiologia",
    "Dolor toracico  al esfuerzo",
    "Angina",
    "ECG",
    "Evaluacion",
    "Alta",
]


def xlsx(*filas: Sequence[object]) -> bytes:
    libro = Workbook()
    for fila in filas:
        libro.active.append(fila)
    salida = io.BytesIO()
    libro.save(salida)
    return salida.getvalue()


def test_el_texto_es_el_mismo_que_arma_la_app() -> None:
    datos = leer_archivo("datos.xlsx", xlsx(ENCABEZADO, FILA))

    interconsulta = Interconsulta(
        **dict(
            zip(
                [
                    "espec_origen",
                    "edad",
                    "sexo",
                    "espec_destino",
                    "historia_clinica",
                    "fundamentos_diagnostico",
                    "examenes_complementarios",
                    "motivo_interconsulta",
                ],
                FILA[:-1],
                strict=True,
            )
        )
    )
    assert datos.ejemplos == [
        {"texto": construir_texto(interconsulta), "etiqueta": "alta"}
    ]
    assert datos.por_clase == {"baja": 0, "media": 0, "alta": 1}


def test_csv_con_punto_y_coma_y_en_cp1252() -> None:
    contenido = (
        "HISTORIA_CLINICA;PRIORIDAD\nCefalea crónica;Media\nLumbago;baja\n"
    ).encode("cp1252")

    datos = leer_archivo("datos.csv", contenido)

    assert [e["etiqueta"] for e in datos.ejemplos] == ["media", "baja"]
    assert "Cefalea crónica" in datos.ejemplos[0]["texto"]
    # Sin edad no aparece "None" en el texto.
    assert "None" not in datos.ejemplos[0]["texto"]


def test_reconoce_las_columnas_de_los_datos_sinteticos() -> None:
    contenido = xlsx(
        [
            "id",
            "edad",
            "sexo",
            "especialidad_origen",
            "especialidad_destino",
            "diagnostico_primario",
            "examenes_complementarios",
            "historia_clinica",
            "prioridad",
            "tipo_caso",
        ],
        [
            1,
            57,
            "Masculino",
            "APS",
            "Cirugía",
            "Sospecha de cáncer",
            "CEA",
            "Rectorragia",
            "ALTA",
            "estándar",
        ],
    )

    (ejemplo,) = leer_archivo("sinteticos.xlsx", contenido).ejemplos

    assert ejemplo == {
        "texto": "APS 57 Masculino Cirugía Rectorragia Sospecha de cáncer CEA",
        "etiqueta": "alta",
    }


@pytest.mark.parametrize(
    "contenido",
    [
        [{"HISTORIA_CLINICA": "Disnea", "PRIORIDAD": "alta"}],
        {"interconsultas": [{"historia_clinica": "Disnea", "prioridad": "alta"}]},
    ],
)
def test_json_como_lista_o_dentro_de_un_objeto(contenido: object) -> None:
    datos = leer_archivo("datos.json", json.dumps(contenido).encode())

    assert datos.ejemplos == [{"texto": "Disnea", "etiqueta": "alta"}]


def test_las_filas_malas_se_informan_sin_detener_el_archivo() -> None:
    contenido = xlsx(
        ["HISTORIA_CLINICA", "PRIORIDAD"],
        ["Disnea", "alta"],
        ["Sin prioridad", None],
        ["Prioridad rara", "urgente"],
        [None, "baja"],
        [None, None],
    )

    datos = leer_archivo("datos.xlsx", contenido)

    assert len(datos.ejemplos) == 1
    assert datos.n_rechazadas == 3
    assert datos.rechazadas == [
        {"fila": 3, "motivo": "Sin prioridad."},
        {
            "fila": 4,
            "motivo": "Prioridad «urgente» no válida: debe ser alta, media o baja.",
        },
        {"fila": 5, "motivo": "Sin historia clínica."},
    ]


def test_solo_se_detallan_las_primeras_filas_rechazadas() -> None:
    filas = [["HISTORIA_CLINICA", "PRIORIDAD"]] + [["x", "?"]] * 30

    datos = leer_archivo("datos.xlsx", xlsx(*filas))

    assert datos.n_rechazadas == 30
    assert len(datos.rechazadas) == MAXIMO_RECHAZOS_DETALLE


@pytest.mark.parametrize(
    ("nombre", "contenido", "mensaje"),
    [
        ("datos.txt", b"x", ".csv, .xlsx o .json"),
        ("datos.csv", b"HISTORIA_CLINICA\nDisnea\n", "PRIORIDAD"),
        ("datos.json", b"{no es json", "JSON"),
        ("datos.json", b'{"a": 1}', "lista de interconsultas"),
        ("datos.xlsx", b"no es un excel", "XLSX"),
    ],
)
def test_archivos_invalidos(nombre: str, contenido: bytes, mensaje: str) -> None:
    with pytest.raises(ArchivoDatosInvalidoError, match=mensaje):
        leer_archivo(nombre, contenido)
