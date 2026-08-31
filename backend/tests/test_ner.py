"""Tests del servicio de NER.

Cubren la parte de texto (segmentacion, offsets, agrupacion), que corre sin el
modelo, y el comportamiento de la ingesta cuando el modelo no esta disponible.
"""

from typing import Any

import app.main as main_module
from app.models.interconsulta import Interconsulta
from app.services.ner import (
    agrupar_por_clase,
    resolver_solapamientos,
    segmentar,
)


def _interconsulta(**extra: Any) -> Interconsulta:
    datos: dict[str, Any] = {
        "id": "ic-1",
        "espec_origen": "MEDICINA GENERAL",
        "edad": 68,
        "sexo": "MASCULINO",
        "espec_destino": "CARDIOLOGIA",
        "historia_clinica": "Paciente hipertenso en tratamiento con metformina.",
        "fundamentos_diagnostico": "",
        "examenes_complementarios": "",
        "motivo_interconsulta": "Evaluacion cardiologica.",
    }
    datos.update(extra)
    return Interconsulta(**datos)


# --------------------------------------------------------------- segmentar --
def test_segmentar_corta_en_barra_y_salto_de_linea() -> None:
    texto = "Primera seccion / Segunda seccion"
    fragmentos = segmentar(texto)

    # El corte se hace despues del delimitador, asi que queda en el fragmento.
    assert len(fragmentos) == 2
    assert fragmentos[0][0].strip() == "Primera seccion /"
    assert fragmentos[1][0].strip() == "Segunda seccion"


def test_segmentar_no_parte_codigos_ni_abreviaturas() -> None:
    """K08.1, E. coli y Ex. orina tienen un punto adentro y son una sola cosa."""
    for texto in (
        "K08.1 perdida de dientes",
        "Cultivo con E. coli",
        "Ex. orina alterado",
    ):
        assert len(segmentar(texto)) == 1, texto


def test_segmentar_si_corta_en_punto_de_oracion() -> None:
    texto = "Paciente hipertenso. Consulta por dolor toracico."
    assert len(segmentar(texto)) == 2


def test_segmentar_conserva_offsets_sobre_el_texto_original() -> None:
    """El desplazamiento tiene que permitir reconstruir el texto original."""
    texto = "Dolor toracico. Se deriva a cardiologia / control en 30 dias"
    for fragmento, desplazamiento in segmentar(texto):
        assert texto[desplazamiento : desplazamiento + len(fragmento)] == fragmento


def test_segmentar_texto_vacio_devuelve_un_fragmento() -> None:
    assert segmentar("") == [("", 0)]


# --------------------------------------------------- resolver_solapamientos --
def test_resolver_solapamientos_gana_el_de_mayor_score() -> None:
    entidades = [
        {"texto": "dolor", "inicio": 0, "fin": 5, "score": 0.6, "clase": "Sintoma"},
        {
            "texto": "dolor toracico",
            "inicio": 0,
            "fin": 14,
            "score": 0.9,
            "clase": "Sintoma",
        },
    ]
    resultado = resolver_solapamientos(entidades)

    assert len(resultado) == 1
    assert resultado[0]["texto"] == "dolor toracico"


def test_resolver_solapamientos_conserva_los_disjuntos_ordenados() -> None:
    entidades = [
        {
            "texto": "metformina",
            "inicio": 40,
            "fin": 50,
            "score": 0.8,
            "clase": "Farmaco",
        },
        {"texto": "HTA", "inicio": 0, "fin": 3, "score": 0.7, "clase": "Sigla"},
    ]
    resultado = resolver_solapamientos(entidades)

    assert [e["texto"] for e in resultado] == ["HTA", "metformina"]


# ----------------------------------------------------- agrupar_por_clase ----
def test_agrupar_por_clase_deduplica_sin_distinguir_mayusculas() -> None:
    entidades = {
        "historia_clinica": [
            {"clase": "Sigla", "texto": "HTA"},
            {"clase": "Enfermedad", "texto": "diabetes"},
        ],
        "motivo_interconsulta": [
            {"clase": "Sigla", "texto": "hta"},
            {"clase": "Enfermedad", "texto": "cancer"},
        ],
    }
    agrupado = agrupar_por_clase(entidades)  # type: ignore[arg-type]

    assert agrupado["Sigla"] == ["HTA"]
    assert agrupado["Enfermedad"] == ["diabetes", "cancer"]


# ------------------------------------------------------- ingesta / errores --
class ExtractorDummy:
    def extraer_de_interconsulta(
        self,
        interconsulta: Interconsulta,
    ) -> dict[str, list[dict[str, Any]]]:
        return {
            "historia_clinica": [
                {
                    "clase": "Sigla",
                    "clase_original": "Abbreviation",
                    "texto": "HTA",
                    "inicio": 0,
                    "fin": 3,
                    "score": 0.99,
                }
            ]
        }


class ExtractorQueFalla:
    def extraer_de_interconsulta(self, interconsulta: Interconsulta) -> dict:
        raise RuntimeError("modelo no encontrado")


def test_extraer_entidades_guarda_el_resultado(monkeypatch) -> None:
    monkeypatch.setattr(main_module, "get_extractor_ner", lambda: ExtractorDummy())
    interconsulta = _interconsulta()

    procesadas = main_module._extraer_entidades([interconsulta])

    assert procesadas == 1
    assert interconsulta.entidades is not None
    assert interconsulta.entidades["historia_clinica"][0]["texto"] == "HTA"
    assert interconsulta.entidades_error is None


def test_extraer_entidades_registra_el_error_sin_romper(monkeypatch) -> None:
    """Un fallo del NER no puede tumbar la carga: se anota y se sigue."""
    monkeypatch.setattr(main_module, "get_extractor_ner", lambda: ExtractorQueFalla())
    interconsulta = _interconsulta()

    procesadas = main_module._extraer_entidades([interconsulta])

    assert procesadas == 0
    assert interconsulta.entidades is None
    assert interconsulta.entidades_error is not None
    assert "modelo no encontrado" in interconsulta.entidades_error


def test_extraer_entidades_sin_interconsultas_no_carga_el_modelo(monkeypatch) -> None:
    def explotar() -> Any:
        raise AssertionError("no deberia cargarse el modelo con la lista vacia")

    monkeypatch.setattr(main_module, "get_extractor_ner", explotar)

    assert main_module._extraer_entidades([]) == 0
