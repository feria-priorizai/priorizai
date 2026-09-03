from __future__ import annotations

import logging
import unicodedata
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from app.core.config import settings
from app.schemas.priorizacion import ProbabilidadesPrioridad, ResultadoPriorizacion

if TYPE_CHECKING:
    from app.models.interconsulta import Interconsulta


logger = logging.getLogger(__name__)

PRIORITY_ORDER = ["baja", "media", "alta"]
FALLBACK_ID2LABEL = {0: "baja", 1: "media", 2: "alta"}


@dataclass(frozen=True)
class ModeloConfiguracion:
    path: str
    max_length: int
    batch_size: int
    # Vacio = deducir del modelo. Ver Settings.model_labels.
    labels: tuple[str, ...] = ()


def normalizar_clase(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", str(texto))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return texto.strip().lower()


def aplicar_resultado(
    interconsulta: Interconsulta,
    resultado: ResultadoPriorizacion,
) -> None:
    """Vuelca la prediccion del modelo sobre la interconsulta.

    Punto unico: la ingesta (main.upload_csv) y los endpoints de priorizacion
    comparten esta funcion para que el guard de banderas rojas no quede en una
    sola de las dos rutas.

    No pisa prioridad_actual cuando la forzo una bandera roja (D5 / HU5-c3): la
    regla determinista manda sobre la sugerencia del modelo. La sugerencia igual
    se guarda en prioridad_sugerida_modelo, para que el medico vea ambas.
    """
    interconsulta.prioridad_sugerida_modelo = resultado.prioridad
    interconsulta.confianza_modelo = resultado.confianza
    interconsulta.prob_baja = resultado.probabilidades.baja
    interconsulta.prob_media = resultado.probabilidades.media
    interconsulta.prob_alta = resultado.probabilidades.alta
    interconsulta.motivo_sin_prioridad = None
    if not interconsulta.prioridad_forzada_por_regla:
        interconsulta.prioridad_actual = resultado.prioridad


def tiene_informacion_clinica(interconsulta: Interconsulta) -> bool:
    """Si los cuatro campos de texto estan vacios no hay nada que predecir.

    Definicion unica: la ingesta (`main`) y los endpoints de priorizacion
    comparten este criterio, para que no puedan divergir.
    """
    campos = [
        interconsulta.historia_clinica,
        interconsulta.fundamentos_diagnostico,
        interconsulta.examenes_complementarios,
        interconsulta.motivo_interconsulta,
    ]
    return any(bool(campo and campo.strip()) for campo in campos)


def construir_texto(interconsulta: Interconsulta) -> str:
    partes = [
        interconsulta.espec_origen,
        str(interconsulta.edad),
        interconsulta.sexo,
        interconsulta.espec_destino,
        interconsulta.historia_clinica,
        interconsulta.fundamentos_diagnostico,
        interconsulta.examenes_complementarios or "",
        interconsulta.motivo_interconsulta,
    ]
    return " ".join(" ".join(part.split()) for part in partes if part is not None)


class PriorizadorRigoBerta:
    def __init__(self, config: ModeloConfiguracion) -> None:
        self.config = config
        self._tokenizer: Any | None = None
        self._model: Any | None = None
        self._device: Any | None = None
        self._label_names: list[str] | None = None

    def predecir(
        self,
        interconsultas: list[Interconsulta],
    ) -> list[ResultadoPriorizacion]:
        if not interconsultas:
            return []

        self._cargar_modelo()
        textos = [construir_texto(interconsulta) for interconsulta in interconsultas]
        probabilidades = self._predecir_textos(textos)

        resultados = []
        for interconsulta, probs in zip(interconsultas, probabilidades, strict=True):
            resultados.append(self._crear_resultado(interconsulta.id, probs))
        return resultados

    def _cargar_modelo(self) -> None:
        if self._model is not None and self._tokenizer is not None:
            return

        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._tokenizer = AutoTokenizer.from_pretrained(self.config.path)
        self._model = AutoModelForSequenceClassification.from_pretrained(
            self.config.path,
        )
        self._model.to(self._device).eval()
        self._label_names = self._resolver_labels()

    def _resolver_labels(self) -> list[str]:
        model = cast(Any, self._model)
        config = model.config

        if self.config.labels:
            return self._labels_configurados(config.num_labels)
        id2label = getattr(config, "id2label", None) or {}
        raw = []
        for i in range(config.num_labels):
            raw.append(id2label.get(i, id2label.get(str(i))))

        normalized = [
            normalizar_clase(label) if label is not None else None for label in raw
        ]
        if all(label in PRIORITY_ORDER for label in normalized):
            return [str(label) for label in normalized]

        if config.num_labels != len(FALLBACK_ID2LABEL):
            raise ValueError(
                "El numero de clases del modelo no coincide con FALLBACK_ID2LABEL",
            )

        logger.warning(
            "El modelo no declara sus clases (id2label=%s): se asume el orden de FALLBACK_ID2LABEL=%s. Si no coincide con el LabelEncoder del entrenamiento, TODAS las prioridades quedan mal asignadas. Fijar el orden real con la variable MODEL_LABELS.",
            raw,
            FALLBACK_ID2LABEL,
        )
        return [
            normalizar_clase(FALLBACK_ID2LABEL[i]) for i in range(config.num_labels)
        ]

    def _labels_configurados(self, num_labels: int) -> list[str]:
        """Orden fijado a mano por configuracion (MODEL_LABELS)."""
        labels = [normalizar_clase(label) for label in self.config.labels]
        if len(labels) != num_labels:
            raise ValueError(
                f"MODEL_LABELS define {len(labels)} clases y el modelo tiene "
                f"{num_labels}",
            )
        desconocidas = [label for label in labels if label not in PRIORITY_ORDER]
        if desconocidas:
            raise ValueError(
                f"MODEL_LABELS contiene clases desconocidas: {desconocidas}. "
                f"Las validas son {PRIORITY_ORDER}",
            )
        return labels

    def _predecir_textos(self, textos: list[str]) -> Any:
        import torch

        tokenizer = cast(Any, self._tokenizer)
        model = cast(Any, self._model)
        device = cast(Any, self._device)
        all_probs = []
        for start in range(0, len(textos), self.config.batch_size):
            batch = textos[start : start + self.config.batch_size]
            encoded = tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=self.config.max_length,
                return_tensors="pt",
            ).to(device)

            with torch.no_grad():
                logits = model(**encoded).logits
                probs = torch.softmax(logits, dim=-1)
                all_probs.append(probs.cpu())

        return torch.cat(all_probs, dim=0)

    def _crear_resultado(
        self,
        interconsulta_id: str,
        probs: Any,
    ) -> ResultadoPriorizacion:
        assert self._label_names is not None

        valores = {
            self._label_names[i]: round(float(probs[i]) * 100, 2)
            for i in range(len(self._label_names))
        }
        probabilidades = ProbabilidadesPrioridad(
            baja=valores.get("baja", 0.0),
            media=valores.get("media", 0.0),
            alta=valores.get("alta", 0.0),
        )
        prioridad = max(
            PRIORITY_ORDER, key=lambda clase: getattr(probabilidades, clase)
        )
        confianza = getattr(probabilidades, prioridad)

        return ResultadoPriorizacion(
            id=interconsulta_id,
            prioridad=prioridad,
            confianza=confianza,
            probabilidades=probabilidades,
        )


priorizador = PriorizadorRigoBerta(
    ModeloConfiguracion(
        path=settings.model_path,
        max_length=settings.model_max_length,
        batch_size=settings.model_batch_size,
        labels=settings.model_labels,
    ),
)


def get_priorizador() -> PriorizadorRigoBerta:
    return priorizador
