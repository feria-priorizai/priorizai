"""Extraccion de entidades clinicas (NER) sobre el texto de las interconsultas.

La logica de segmentacion y de ajuste de bordes viene de models/NER/extractor.py.
Se copia aca en vez de importarla desde el volumen porque /workspace solo existe
cuando el compose esta levantado: los tests y el CI cargan este modulo sin el
modelo montado, y la parte de texto tiene que poder ejecutarse igual.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from app.core.config import settings

if TYPE_CHECKING:
    from app.models.interconsulta import Interconsulta


# Campos de la interconsulta sobre los que se corre el modelo, en el orden en
# que se muestran en la interfaz.
CAMPOS_CLINICOS = (
    "historia_clinica",
    "fundamentos_diagnostico",
    "examenes_complementarios",
    "motivo_interconsulta",
)

# El modelo predice cuatro clases. Symptom queda fuera por defecto: su F1 es
# 0.51 contra 0.73-0.88 de las demas sobre interconsultas reales.
NOMBRES = {
    "Disease": "Enfermedad",
    "Medication": "Farmaco",
    "Abbreviation": "Sigla",
    "Symptom": "Sintoma",
}

_CORTE_DURO = "/\n"
_PUNTUACION_FINAL = " \t\n\r.,;:)]}"
_PUNTUACION_INICIAL = " \t\n\r.,;:([{"


@dataclass(frozen=True)
class ConfiguracionNER:
    path: str
    clases: tuple[str, ...]
    umbral: float
    max_length: int


def _es_numero(token: str) -> bool:
    return token.replace(",", "").replace(".", "").isdigit()


def segmentar(texto: str) -> list[tuple[str, int]]:
    """Divide el texto en fragmentos, devolviendo (fragmento, desplazamiento).

    NO ES OPCIONAL. Con la interconsulta entera el modelo colapsa y devuelve
    listas vacias: aprendio a usar el estilo global del texto como pista del
    corpus de origen, asi que fuera de distribucion el argmax cae en 'O'.

    Corta siempre en '/' y salto de linea, que en las interconsultas separan
    secciones. En '.', '!' y '?' corta solo cuando no parece codigo ni
    abreviatura (K08.1, E. coli, Ex. orina), que son casos frecuentes en el
    corpus y partirlos en dos cuesta F1.
    """
    cortes: list[int] = []
    for match in re.finditer(r"[/\n]|[.!?]", texto):
        if match.group(0) in _CORTE_DURO:
            cortes.append(match.end())
            continue

        previo = re.search(r"(\S+)\s*$", texto[: match.start()])
        anterior = previo.group(1) if previo else ""
        proximo = re.match(r"\s*(\S+)", texto[match.end() :])
        siguiente = proximo.group(1) if proximo else ""

        if _es_numero(anterior) or _es_numero(siguiente):
            continue
        if anterior and anterior[0].isupper() and len(anterior) <= 4:
            continue
        cortes.append(match.end())

    trozos: list[tuple[str, int]] = []
    inicio = 0
    for corte in [*cortes, len(texto)]:
        if corte <= inicio:
            continue
        fragmento = texto[inicio:corte]
        if fragmento.strip():
            trozos.append((fragmento, inicio))
        inicio = corte
    return trozos or [(texto, 0)]


def _ajustar(texto: str, inicio: int, fin: int) -> tuple[int, int]:
    """Saca espacios y puntuacion que el tokenizador arrastra a los bordes."""
    while inicio < fin and texto[fin - 1] in _PUNTUACION_FINAL:
        fin -= 1
    while inicio < fin and texto[inicio] in _PUNTUACION_INICIAL:
        inicio += 1
    return inicio, fin


def resolver_solapamientos(entidades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ante spans solapados gana el de mayor score; a igualdad, el mas largo."""
    ordenadas = sorted(
        entidades,
        key=lambda e: (-e["score"], -(e["fin"] - e["inicio"])),
    )
    salida: list[dict[str, Any]] = []
    ocupado: list[tuple[int, int]] = []
    for entidad in ordenadas:
        if any(
            entidad["inicio"] < fin and inicio < entidad["fin"]
            for inicio, fin in ocupado
        ):
            continue
        salida.append(entidad)
        ocupado.append((entidad["inicio"], entidad["fin"]))
    salida.sort(key=lambda e: e["inicio"])
    return salida


class ExtractorEntidades:
    def __init__(self, config: ConfiguracionNER) -> None:
        self.config = config
        self._pipeline: Any | None = None

    def _cargar_modelo(self) -> None:
        if self._pipeline is not None:
            return

        import torch
        from transformers import (
            AutoModelForTokenClassification,
            AutoTokenizer,
            pipeline,
        )

        ruta = self.config.path
        # add_prefix_space solo lo aceptan los tokenizers BPE tipo RoBERTa.
        try:
            tokenizer = AutoTokenizer.from_pretrained(ruta, add_prefix_space=True)
        except (TypeError, ValueError):
            tokenizer = AutoTokenizer.from_pretrained(ruta)

        # `max_length` era configuracion muerta: el pipeline de
        # token-classification no acepta `truncation` ni `max_length` como
        # argumentos, hay que dejarselo dicho al tokenizador.
        tokenizer.model_max_length = self.config.max_length

        modelo = AutoModelForTokenClassification.from_pretrained(ruta)
        modelo.eval()

        self._pipeline = pipeline(
            "token-classification",
            model=modelo,
            tokenizer=tokenizer,
            aggregation_strategy="first",
            device=0 if torch.cuda.is_available() else -1,
        )

    def extraer(self, texto: str) -> list[dict[str, Any]]:
        """Entidades de un texto, ordenadas por posicion y sin solapamientos.

        Los offsets son sobre el texto ORIGINAL: texto[inicio:fin] reconstruye
        siempre la entidad, aunque la deteccion se haya hecho por fragmentos.
        """
        if not texto or not texto.strip():
            return []

        self._cargar_modelo()
        nlp = cast(Any, self._pipeline)

        crudas: list[dict[str, Any]] = []
        for fragmento, desplazamiento in segmentar(texto):
            for prediccion in nlp(fragmento):
                grupo = prediccion["entity_group"]
                if grupo not in self.config.clases:
                    continue
                if prediccion["score"] < self.config.umbral:
                    continue

                inicio, fin = _ajustar(
                    texto,
                    desplazamiento + prediccion["start"],
                    desplazamiento + prediccion["end"],
                )
                if inicio >= fin:
                    continue

                crudas.append(
                    {
                        "clase": NOMBRES.get(grupo, grupo),
                        "clase_original": grupo,
                        "texto": texto[inicio:fin],
                        "inicio": inicio,
                        "fin": fin,
                        "score": round(float(prediccion["score"]), 4),
                    }
                )

        return resolver_solapamientos(crudas)

    def extraer_de_interconsulta(
        self,
        interconsulta: Interconsulta,
    ) -> dict[str, list[dict[str, Any]]]:
        """Entidades por campo clinico. Los campos vacios no aparecen."""
        por_campo: dict[str, list[dict[str, Any]]] = {}
        for campo in CAMPOS_CLINICOS:
            texto = getattr(interconsulta, campo, None) or ""
            entidades = self.extraer(texto)
            if entidades:
                por_campo[campo] = entidades
        return por_campo


def agrupar_por_clase(
    entidades_por_campo: dict[str, list[dict[str, Any]]],
) -> dict[str, list[str]]:
    """Resumen deduplicado para la tabla de la interfaz.

    {"Enfermedad": ["HTA", "diabetes tipo 2"], "Farmaco": ["metformina"]}
    """
    agrupado: dict[str, list[str]] = {}
    vistos: set[tuple[str, str]] = set()
    for entidades in entidades_por_campo.values():
        for entidad in entidades:
            clave = (entidad["clase"], entidad["texto"].lower())
            if clave in vistos:
                continue
            vistos.add(clave)
            agrupado.setdefault(entidad["clase"], []).append(entidad["texto"])
    return agrupado


extractor = ExtractorEntidades(
    ConfiguracionNER(
        path=settings.ner_model_path,
        clases=settings.ner_clases,
        umbral=settings.ner_umbral,
        max_length=settings.ner_max_length,
    ),
)


def get_extractor_ner() -> Any:
    """El modelo local, o el cliente HTTP si hay MODEL_SERVICE_URL.

    Los dos exponen extraer_de_interconsulta(ic) -> dict[campo, entidades].
    """
    from app.services.cliente_modelos import (
        get_extractor_remoto,
        usar_servicio_remoto,
    )

    if usar_servicio_remoto():
        return get_extractor_remoto()
    return extractor
