"""Tests del cliente HTTP del servicio de modelos.

Lo que se verifica: que sin MODEL_SERVICE_URL nada cambie, que con la variable
se use el cliente remoto, y que el contrato de fallo sea el mismo que con el
modelo local (una excepcion que quien llama ya captura).
"""

from typing import Any

import httpx
import pytest

from app.core.config import settings
from app.models.interconsulta import Interconsulta
from app.services.cliente_modelos import (
    ExtractorRemoto,
    PriorizadorRemoto,
    ServicioModelosError,
)
from app.services.ner import get_extractor_ner
from app.services.priorizador import get_priorizador

URL = "https://servicio-modelos.example.com"


def _interconsulta(**extra: Any) -> Interconsulta:
    datos: dict[str, Any] = {
        "id": "ic-1",
        "espec_origen": "MEDICINA GENERAL",
        "edad": 68,
        "sexo": "MASCULINO",
        "espec_destino": "CARDIOLOGIA",
        "historia_clinica": "Paciente hipertenso con metformina.",
        "fundamentos_diagnostico": "Dolor precordial.",
        "examenes_complementarios": None,
        "motivo_interconsulta": "Evaluacion cardiologica.",
    }
    datos.update(extra)
    return Interconsulta(**datos)


class RespuestaFalsa:
    def __init__(self, datos: dict[str, Any], status_code: int = 200) -> None:
        self._datos = datos
        self.status_code = status_code
        self.text = str(datos)

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "error", request=None, response=self  # type: ignore[arg-type]
            )

    def json(self) -> dict[str, Any]:
        return self._datos


# --------------------------------------------------------------- la bifurcacion
def test_sin_url_se_usa_el_modelo_local(monkeypatch) -> None:
    """El comportamiento por defecto no cambia."""
    monkeypatch.setattr(settings, "model_service_url", "")

    assert not isinstance(get_priorizador(), PriorizadorRemoto)
    assert not isinstance(get_extractor_ner(), ExtractorRemoto)


def test_con_url_se_usa_el_cliente_remoto(monkeypatch) -> None:
    monkeypatch.setattr(settings, "model_service_url", URL)

    assert isinstance(get_priorizador(), PriorizadorRemoto)
    assert isinstance(get_extractor_ner(), ExtractorRemoto)


# ------------------------------------------------------------------ priorizar
def test_priorizar_manda_los_campos_y_parsea_la_respuesta(monkeypatch) -> None:
    monkeypatch.setattr(settings, "model_service_url", URL)
    capturado: dict[str, Any] = {}

    def post_falso(url, json, timeout, headers):
        capturado["url"] = url
        capturado["json"] = json
        return RespuestaFalsa(
            {
                "total": 1,
                "resultados": [
                    {
                        "id": "ic-1",
                        "prioridad": "alta",
                        "confianza": 91.2,
                        "probabilidades": {"baja": 3.1, "media": 5.7, "alta": 91.2},
                    }
                ],
            }
        )

    monkeypatch.setattr(httpx, "post", post_falso)

    resultados = PriorizadorRemoto().predecir([_interconsulta()])

    assert capturado["url"] == f"{URL}/priorizar"
    enviada = capturado["json"]["interconsultas"][0]
    assert enviada["id"] == "ic-1"
    assert enviada["edad"] == 68
    # examenes_complementarios era None: viaja como cadena vacia, no como null.
    assert enviada["examenes_complementarios"] == ""

    assert len(resultados) == 1
    assert resultados[0].prioridad == "alta"
    assert resultados[0].probabilidades.alta == 91.2


def test_priorizar_con_lista_vacia_no_llama_al_servicio(monkeypatch) -> None:
    monkeypatch.setattr(settings, "model_service_url", URL)

    def explotar(*args, **kwargs):
        raise AssertionError("no deberia hacerse la peticion")

    monkeypatch.setattr(httpx, "post", explotar)

    assert PriorizadorRemoto().predecir([]) == []


# ------------------------------------------------------------------ entidades
def test_extraer_devuelve_las_entidades_del_documento(monkeypatch) -> None:
    monkeypatch.setattr(settings, "model_service_url", URL)
    capturado: dict[str, Any] = {}

    def post_falso(url, json, timeout, headers):
        capturado["json"] = json
        return RespuestaFalsa(
            {
                "total": 1,
                "resultados": [
                    {
                        "id": "ic-1",
                        "entidades": {
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
                        },
                    }
                ],
            }
        )

    monkeypatch.setattr(httpx, "post", post_falso)

    entidades = ExtractorRemoto().extraer_de_interconsulta(_interconsulta())

    campos = capturado["json"]["documentos"][0]["campos"]
    assert set(campos) == {
        "historia_clinica",
        "fundamentos_diagnostico",
        "examenes_complementarios",
        "motivo_interconsulta",
    }
    assert entidades["historia_clinica"][0]["texto"] == "HTA"


def test_extraer_sin_texto_no_llama_al_servicio(monkeypatch) -> None:
    monkeypatch.setattr(settings, "model_service_url", URL)

    def explotar(*args, **kwargs):
        raise AssertionError("no deberia hacerse la peticion")

    monkeypatch.setattr(httpx, "post", explotar)

    vacia = _interconsulta(
        historia_clinica="",
        fundamentos_diagnostico="",
        examenes_complementarios="",
        motivo_interconsulta="",
    )
    assert ExtractorRemoto().extraer_de_interconsulta(vacia) == {}


# --------------------------------------------------------------------- fallos
def test_un_error_de_red_se_convierte_en_excepcion(monkeypatch) -> None:
    """Quien llama ya captura Exception: el fallo se registra igual que antes."""
    monkeypatch.setattr(settings, "model_service_url", URL)

    def post_falso(*args, **kwargs):
        raise httpx.ConnectError("sin conexion")

    monkeypatch.setattr(httpx, "post", post_falso)

    with pytest.raises(ServicioModelosError, match="No se pudo contactar"):
        PriorizadorRemoto().predecir([_interconsulta()])


def test_un_503_del_servicio_se_convierte_en_excepcion(monkeypatch) -> None:
    monkeypatch.setattr(settings, "model_service_url", URL)

    monkeypatch.setattr(
        httpx,
        "post",
        lambda url, json, timeout, headers: RespuestaFalsa(
            {"detail": "modelo caido"}, 503
        ),
    )

    with pytest.raises(ServicioModelosError, match="respondio 503"):
        PriorizadorRemoto().predecir([_interconsulta()])


# ------------------------------------------------------------------ api key --
def test_sin_clave_no_se_manda_la_cabecera(monkeypatch) -> None:
    """El servicio puede estar abierto: no se inventa una cabecera vacia."""
    monkeypatch.setattr(settings, "model_service_url", URL)
    monkeypatch.setattr(settings, "model_service_api_key", "")
    capturado: dict[str, Any] = {}

    def post_falso(url, json, timeout, headers):
        capturado["headers"] = headers
        return RespuestaFalsa({"total": 0, "resultados": []})

    monkeypatch.setattr(httpx, "post", post_falso)
    PriorizadorRemoto().predecir([_interconsulta()])

    assert capturado["headers"] == {}


def test_con_clave_viaja_en_la_cabecera(monkeypatch) -> None:
    monkeypatch.setattr(settings, "model_service_url", URL)
    monkeypatch.setattr(settings, "model_service_api_key", "clave-secreta")
    capturado: dict[str, Any] = {}

    def post_falso(url, json, timeout, headers):
        capturado["headers"] = headers
        return RespuestaFalsa({"total": 1, "resultados": []})

    monkeypatch.setattr(httpx, "post", post_falso)
    ExtractorRemoto().extraer_de_interconsulta(_interconsulta())

    assert capturado["headers"] == {"X-API-Key": "clave-secreta"}


def test_un_401_dice_que_revisar(monkeypatch) -> None:
    """Un 401 es un error de configuracion, no del servicio: hay que poder
    distinguirlo en el log sin ir al codigo."""
    monkeypatch.setattr(settings, "model_service_url", URL)
    monkeypatch.setattr(settings, "model_service_api_key", "clave-mala")

    monkeypatch.setattr(
        httpx,
        "post",
        lambda url, json, timeout, headers: RespuestaFalsa({"detail": "no"}, 401),
    )

    with pytest.raises(ServicioModelosError, match="MODEL_SERVICE_API_KEY"):
        PriorizadorRemoto().predecir([_interconsulta()])
