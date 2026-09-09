"""Clientes HTTP del servicio de modelos.

Exponen exactamente los mismos metodos que las implementaciones en proceso
(`PriorizadorRigoBerta.predecir` y `ExtractorEntidades.extraer_de_interconsulta`),
para que los tres puntos que llaman a los modelos no tengan que cambiar: se
sustituye solo lo que devuelven `get_priorizador()` y `get_extractor_ner()`.

Se activan con MODEL_SERVICE_URL. Sin esa variable, el backend sigue cargando
los modelos en su propio proceso como hasta ahora.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, cast

import httpx

from app.core.config import settings
from app.schemas.priorizacion import ProbabilidadesPrioridad, ResultadoPriorizacion
from app.services.ner import CAMPOS_CLINICOS

if TYPE_CHECKING:
    from app.models.interconsulta import Interconsulta

logger = logging.getLogger(__name__)


class ServicioModelosError(RuntimeError):
    """Fallo al hablar con el servicio de modelos.

    Hereda de RuntimeError a proposito: quienes llaman ya capturan Exception
    y registran el motivo en motivo_sin_prioridad o entidades_error, asi que
    el comportamiento ante un fallo es el mismo que con el modelo local.
    """


def _cabeceras() -> dict[str, str]:
    """Clave compartida, si el servicio la exige.

    La URL del servicio no es un secreto: aparece en logs y en cualquier
    configuracion que se comparta. Esta cabecera es lo que evita que quien de
    con ella pueda usarlo.
    """
    if not settings.model_service_api_key:
        return {}
    return {"X-API-Key": settings.model_service_api_key}


def _post(ruta: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{settings.model_service_url.rstrip('/')}{ruta}"
    try:
        respuesta = httpx.post(
            url,
            json=payload,
            timeout=settings.model_service_timeout,
            headers=_cabeceras(),
        )
        respuesta.raise_for_status()
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 401:
            raise ServicioModelosError(
                "El servicio de modelos rechazo la clave: revisar "
                "MODEL_SERVICE_API_KEY."
            ) from error
        detalle = error.response.text[:300]
        raise ServicioModelosError(
            f"El servicio de modelos respondio {error.response.status_code}: {detalle}"
        ) from error
    except httpx.HTTPError as error:
        # Incluye timeouts. El arranque en frio del servicio puede tardar
        # minutos cargando los pesos: MODEL_SERVICE_TIMEOUT tiene que ser
        # mayor que eso o la primera carga despues de un rato inactivo falla.
        raise ServicioModelosError(
            f"No se pudo contactar al servicio de modelos en {url}: {error}"
        ) from error

    return cast(dict[str, Any], respuesta.json())


class PriorizadorRemoto:
    """Mismo contrato que PriorizadorRigoBerta, contra el servicio HTTP."""

    def predecir(
        self,
        interconsultas: list[Interconsulta],
    ) -> list[ResultadoPriorizacion]:
        if not interconsultas:
            return []

        payload = {
            "interconsultas": [
                {
                    "id": interconsulta.id,
                    "espec_origen": interconsulta.espec_origen or "",
                    "edad": interconsulta.edad,
                    "sexo": interconsulta.sexo or "",
                    "espec_destino": interconsulta.espec_destino or "",
                    "historia_clinica": interconsulta.historia_clinica or "",
                    "fundamentos_diagnostico": (
                        interconsulta.fundamentos_diagnostico or ""
                    ),
                    "examenes_complementarios": (
                        interconsulta.examenes_complementarios or ""
                    ),
                    "motivo_interconsulta": interconsulta.motivo_interconsulta or "",
                }
                for interconsulta in interconsultas
            ]
        }

        datos = _post("/priorizar", payload)
        return [
            ResultadoPriorizacion(
                id=resultado["id"],
                prioridad=resultado["prioridad"],
                confianza=resultado["confianza"],
                probabilidades=ProbabilidadesPrioridad(
                    **resultado["probabilidades"],
                ),
            )
            for resultado in datos["resultados"]
        ]


class ExtractorRemoto:
    """Mismo contrato que ExtractorEntidades, contra el servicio HTTP."""

    def extraer_de_interconsulta(
        self,
        interconsulta: Interconsulta,
    ) -> dict[str, list[dict[str, Any]]]:
        campos = {
            campo: getattr(interconsulta, campo, None) or ""
            for campo in CAMPOS_CLINICOS
        }
        if not any(texto.strip() for texto in campos.values()):
            return {}

        payload: dict[str, Any] = {
            "documentos": [{"id": interconsulta.id, "campos": campos}],
            "umbral": settings.ner_umbral,
            "clases": list(settings.ner_clases),
        }

        datos = _post("/extraer-entidades", payload)
        resultados = datos.get("resultados") or []
        if not resultados:
            return {}
        return resultados[0].get("entidades") or {}


_priorizador_remoto = PriorizadorRemoto()
_extractor_remoto = ExtractorRemoto()


def usar_servicio_remoto() -> bool:
    return bool(settings.model_service_url)


def get_priorizador_remoto() -> PriorizadorRemoto:
    return _priorizador_remoto


def get_extractor_remoto() -> ExtractorRemoto:
    return _extractor_remoto
