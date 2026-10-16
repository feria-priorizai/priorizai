"""Explicabilidad de la prioridad que sugiere el modelo, con SHAP por campo.

Responde *cuanto aporto cada campo* a la probabilidad de la clase sugerida. Con
8 campos hay 2^8 = 256 combinaciones, asi que el valor de Shapley se calcula
exacto y no por muestreo: dos ejecuciones dan lo mismo, y los aportes suman
exactamente la diferencia entre la prediccion y la del texto sin campos.

Despues mira dentro de cada campo: cuanto pesa cada palabra, medido como lo que
cambia la probabilidad si se borra solo esa palabra (ver _peso_de_palabras).

Son cientos de pasadas de XLM-RoBERTa large, unos minutos en CPU: por eso no se
calcula en la ingesta, corre en segundo plano y el resultado se guarda.

Se explica lo que el modelo leyo. Un texto que pasa el limite de tokens se trunca
al predecir; lo que quedo fuera no influyo en la sugerencia, asi que tampoco
recibe aporte.

Explica al modelo, no a la clinica. Que un campo pese no dice que sea relevante
para el paciente, sino que el modelo aprendio a usarlo.
"""

from __future__ import annotations

import itertools
import logging
import threading
import time
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from app.core.config import settings
from app.core.tiempo import utc_now
from app.schemas.explicacion import VERSION_EXPLICACION

if TYPE_CHECKING:
    from app.models.interconsulta import Interconsulta
    from app.services.priorizador import RecursosModelo

logger = logging.getLogger(__name__)

# Mismo orden que priorizador.construir_texto. El texto que se explica tiene que
# ser exactamente el que el modelo ve al predecir: cualquier diferencia, aunque
# sea un espacio, explica otra prediccion.
CAMPOS_MODELO = (
    "espec_origen",
    "edad",
    "sexo",
    "espec_destino",
    "historia_clinica",
    "fundamentos_diagnostico",
    "examenes_complementarios",
    "motivo_interconsulta",
)

# Campos que son un valor y no texto libre: se pesan enteros. Borrar "MEDICINA"
# de "MEDICINA GENERAL" deja una especialidad que no existe, y lo que mide no
# es el peso de la palabra sino la rareza del texto que queda.
CAMPOS_ENTEROS = frozenset({"espec_origen", "edad", "sexo", "espec_destino"})

# La fase del avance: "preparando" (la pone la cola), "calculando" (las
# combinaciones de campos) y "palabras" (el peso de cada palabra).
FASE_CALCULANDO = "calculando"
FASE_PALABRAS = "palabras"

# Avance: (fase, hechos, total). Lo usa la cola para mostrar progreso real.
Avance = Callable[[str, int, int], None]

# Las explicaciones se serializan: cada una ocupa toda la CPU por minutos. La
# cola ya las corre de a una; esto cubre a quien llame a explicar() por fuera.
_cerrojo = threading.Lock()


class ExplicabilidadNoDisponibleError(RuntimeError):
    """El modelo no esta en este proceso, asi que no hay como evaluar las
    combinaciones. Pasa cuando las predicciones vienen del servicio externo."""


def modelo_disponible(priorizador: Any) -> bool:
    return getattr(priorizador, "recursos", None) is not None


# --------------------------------------------------------------------- texto --
@dataclass(frozen=True)
class Palabra:
    """Una palabra con su posicion en los dos textos que importan: el que ve el
    modelo (todos los campos concatenados, espacios colapsados) y el original
    del campo. Con las dos se recorta cada campo a lo que el modelo leyo."""

    campo: str
    inicio_modelo: int
    fin_modelo: int
    inicio: int
    fin: int


def valores_de_interconsulta(interconsulta: Interconsulta) -> dict[str, str | None]:
    """Los campos tal como los toma construir_texto: la edad como texto y los
    examenes vacios en lugar de nulos."""
    return {
        "espec_origen": interconsulta.espec_origen,
        "edad": str(interconsulta.edad),
        "sexo": interconsulta.sexo,
        "espec_destino": interconsulta.espec_destino,
        "historia_clinica": interconsulta.historia_clinica,
        "fundamentos_diagnostico": interconsulta.fundamentos_diagnostico,
        "examenes_complementarios": interconsulta.examenes_complementarios or "",
        "motivo_interconsulta": interconsulta.motivo_interconsulta,
    }


def _spans_palabras(valor: str) -> list[tuple[int, int]]:
    """Inicio y fin de cada palabra. Usa str.isspace, el mismo criterio que
    str.split() en construir_texto: con un regex distinto, algun espacio raro
    quedaria contado de un lado y no del otro."""
    spans = []
    inicio: int | None = None
    for posicion, caracter in enumerate(valor):
        if caracter.isspace():
            if inicio is not None:
                spans.append((inicio, posicion))
                inicio = None
        elif inicio is None:
            inicio = posicion
    if inicio is not None:
        spans.append((inicio, len(valor)))
    return spans


def armar_texto(valores: dict[str, str | None]) -> tuple[str, list[Palabra]]:
    """Arma el mismo texto que construir_texto y registra donde quedo cada
    palabra, para saber hasta donde de cada campo alcanzo a leer el modelo.

    construir_texto colapsa los espacios de cada campo y une los campos con un
    espacio. Un campo vacio igual aporta su separador (de ahi el doble espacio
    que deja un examen vacio); un campo nulo se omite del todo.
    """
    piezas: list[str] = []
    palabras: list[Palabra] = []
    posicion = 0
    for campo in CAMPOS_MODELO:
        valor = valores.get(campo)
        if valor is None:
            continue
        if piezas:
            posicion += 1
        spans = _spans_palabras(valor)
        for indice, (inicio, fin) in enumerate(spans):
            if indice:
                posicion += 1
            largo = fin - inicio
            palabras.append(
                Palabra(campo, posicion, posicion + largo, inicio, fin),
            )
            posicion += largo
        piezas.append(" ".join(valor[inicio:fin] for inicio, fin in spans))
    return " ".join(piezas), palabras


def recortar_a_lo_leido(
    valores: dict[str, str | None],
    palabras: Sequence[Palabra],
    leido_hasta: int,
) -> dict[str, str | None]:
    """Los campos recortados a lo que el modelo alcanzo a leer.

    Un campo que quedo entero fuera pasa a nulo, no a vacio: un nulo se omite
    con su separador, asi el texto con todos los campos presentes es justo el
    prefijo que el modelo leyo, sin espacios de mas al final. Y como es nulo
    tanto presente como ausente, su aporte en SHAP da exactamente cero.
    """
    recortados = dict(valores)
    por_campo: dict[str, list[Palabra]] = {}
    for palabra in palabras:
        por_campo.setdefault(palabra.campo, []).append(palabra)

    for campo, propias in por_campo.items():
        # Leido entero solo si su ultima palabra termina antes del limite: una
        # palabra partida por el limite se leyo a medias.
        if propias[-1].fin_modelo <= leido_hasta:
            continue
        leidas = [p for p in propias if p.inicio_modelo < leido_hasta]
        if not leidas:
            recortados[campo] = None
            continue
        ultima = leidas[-1]
        corte = min(ultima.fin, ultima.inicio + (leido_hasta - ultima.inicio_modelo))
        recortados[campo] = (valores[campo] or "")[:corte]
    return recortados


# -------------------------------------------------------------------- modelo --
def _leido_hasta(recursos: RecursosModelo, texto: str) -> int:
    """Hasta que caracter del texto leyo el modelo: el fin del ultimo token que
    sobrevivio al truncado. Los tokens especiales no son texto y no cuentan."""
    codificado = recursos.tokenizer(
        texto,
        truncation=True,
        max_length=recursos.max_length,
        return_offsets_mapping=True,
        return_special_tokens_mask=True,
    )
    return max(
        (
            int(fin)
            for (_, fin), especial in zip(
                codificado["offset_mapping"],
                codificado["special_tokens_mask"],
                strict=True,
            )
            if not especial
        ),
        default=0,
    )


def _probabilidades(
    recursos: RecursosModelo,
    textos: list[str],
    lote: int,
) -> Any:
    """Probabilidades de cada clase para cada texto, como arreglo numpy."""
    import numpy as np
    import torch

    filas = []
    for inicio in range(0, len(textos), lote):
        codificado = recursos.tokenizer(
            textos[inicio : inicio + lote],
            padding=True,
            truncation=True,
            max_length=recursos.max_length,
            return_tensors="pt",
        ).to(recursos.device)
        with torch.no_grad():
            logits = recursos.model(**codificado).logits
        filas.append(torch.softmax(logits, dim=-1).cpu().numpy())
    return np.concatenate(filas, axis=0)


def _shap_por_campo(
    recursos: RecursosModelo,
    valores: dict[str, str | None],
    leidos: dict[str, str | None],
    indice_clase: int,
    lote: int,
    avance: Avance,
) -> dict[str, Any]:
    """Valor de Shapley exacto de cada campo sobre la probabilidad de la clase.

    Cada coalicion es un texto con algunos campos presentes y el resto vacios.
    "Vacio" es el campo sin texto pero con su separador, igual que un examen
    vacio en una interconsulta real; un campo nulo sigue nulo en todas las
    coaliciones, asi su aporte da exactamente cero. `leidos` son los campos
    recortados a lo que el modelo leyo: la coalicion completa es la entrada real.

    Los textos de las 256 coaliciones se arman y se predicen antes de llamar a
    SHAP. Asi se sabe cuantos hay que predecir (para el avance), y los que se
    repiten se predicen una sola vez: un campo vacio o no leido se ve igual
    presente que ausente, y cada uno de esos divide por dos el trabajo.
    """
    import numpy as np
    import shap

    campos = list(CAMPOS_MODELO)
    ausente = {campo: None if leidos[campo] is None else "" for campo in campos}

    def texto_de(coalicion: Sequence[float]) -> str:
        return armar_texto(
            {
                campo: leidos[campo] if coalicion[indice] >= 0.5 else ausente[campo]
                for indice, campo in enumerate(campos)
            }
        )[0]

    distintos = list(
        dict.fromkeys(
            texto_de(coalicion)
            for coalicion in itertools.product((0, 1), repeat=len(campos))
        )
    )
    cache: dict[str, Any] = {}
    avance(FASE_CALCULANDO, 0, len(distintos))
    for inicio in range(0, len(distintos), lote):
        tramo = distintos[inicio : inicio + lote]
        for texto, fila in zip(
            tramo, _probabilidades(recursos, tramo, lote), strict=True
        ):
            cache[texto] = fila
        avance(FASE_CALCULANDO, len(cache), len(distintos))

    def predecir(coaliciones: Any) -> Any:
        return np.stack([cache[texto_de(fila)] for fila in coaliciones])

    explicador = shap.explainers.Exact(
        predecir,
        shap.maskers.Independent(np.zeros((1, len(campos)))),
    )
    resultado = explicador(np.ones((1, len(campos))))
    aportes = np.asarray(resultado.values)[0][:, indice_clase]
    base = float(np.asarray(resultado.base_values)[0][indice_clase])

    return {
        "base": round(base * 100, 2),
        "final": round((base + float(aportes.sum())) * 100, 2),
        "coaliciones": 2 ** len(campos),
        "evaluadas": len(distintos),
        "campos": [
            {
                "campo": campo,
                "aporte": round(float(aporte) * 100, 3),
                "vacio": not (valores[campo] or "").strip(),
                "no_leido": bool((valores[campo] or "").strip())
                and leidos[campo] is None,
            }
            for campo, aporte in zip(campos, aportes, strict=True)
        ],
    }


# ------------------------------------------------------------------ palabras --
def _texto_sin(
    leidos: dict[str, str | None], palabras: Sequence[Palabra], quitar: int
) -> str:
    """El texto leido sin una palabra: su campo se arma con las demas."""
    campo = palabras[quitar].campo
    original = leidos[campo] or ""
    resto = " ".join(
        original[p.inicio : p.fin]
        for indice, p in enumerate(palabras)
        if p.campo == campo and indice != quitar
    )
    return armar_texto({**leidos, campo: resto})[0]


def _peso_de_palabras(
    recursos: RecursosModelo,
    valores: dict[str, str | None],
    leidos: dict[str, str | None],
    campos: list[dict[str, Any]],
    indice_clase: int,
    lote: int,
    avance: Avance,
) -> dict[str, Any]:
    """Cuanto pesa cada palabra: lo que cambia la probabilidad de la clase si se
    borra solo esa palabra, con el resto de la interconsulta intacto.

    No es SHAP por palabra, a proposito. Medido sobre el modelo real: SHAP por
    palabra (Partition) tardo 3 minutos en una interconsulta corta, con un
    presupuesto que todavia deja grupos de palabras compartiendo un mismo valor,
    y lo que sumaban las palabras de cada campo no calzaba con su aporte exacto
    (-10,5 contra -18,8 en una historia clinica): la vista por palabras
    contradiria a la de campos. Borrar una palabra cuesta una prediccion por
    palabra y se explica en una frase. A cambio, las palabras de un campo no
    suman su aporte: dos palabras que dicen lo mismo se cubren entre si.

    Los campos que son un valor (especialidades, edad, sexo, ver
    CAMPOS_ENTEROS) y los de una sola palabra (un motivo como "SEGUIMIENTO")
    van enteros, con el aporte exacto del campo: ahi el campo es la unidad, y
    borrar una parte mediria otra cosa que el total que se muestra al lado.
    """
    texto_leido, palabras = armar_texto(leidos)
    por_campo = Counter(palabra.campo for palabra in palabras)
    aporte_campo = {campo["campo"]: campo["aporte"] for campo in campos}
    enteros = {
        campo
        for campo, cuantas in por_campo.items()
        if campo in CAMPOS_ENTEROS or cuantas == 1
    }
    sin_palabra = {
        indice: _texto_sin(leidos, palabras, indice)
        for indice, palabra in enumerate(palabras)
        if palabra.campo not in enteros
    }

    # El texto completo va primero y no cuenta en el avance: el avance cuenta
    # palabras.
    distintos = list(dict.fromkeys([texto_leido, *sin_palabra.values()]))
    probabilidad: dict[str, float] = {}
    avance(FASE_PALABRAS, 0, len(distintos) - 1)
    for inicio in range(0, len(distintos), lote):
        tramo = distintos[inicio : inicio + lote]
        for texto, fila in zip(
            tramo, _probabilidades(recursos, tramo, lote), strict=True
        ):
            probabilidad[texto] = float(fila[indice_clase])
        avance(FASE_PALABRAS, len(probabilidad) - 1, len(distintos) - 1)
    completo = probabilidad[texto_leido]

    resultado: dict[str, list[dict[str, Any]]] = {}
    for indice, palabra in enumerate(palabras):
        if palabra.campo in enteros:
            continue
        resultado.setdefault(palabra.campo, []).append(
            {
                "texto": (leidos[palabra.campo] or "")[palabra.inicio : palabra.fin],
                "inicio": palabra.inicio,
                "fin": palabra.fin,
                "aporte": round(
                    (completo - probabilidad[sin_palabra[indice]]) * 100, 3
                ),
            }
        )
    for campo in enteros:
        propias = [palabra for palabra in palabras if palabra.campo == campo]
        inicio, fin = propias[0].inicio, propias[-1].fin
        resultado[campo] = [
            {
                "texto": (leidos[campo] or "")[inicio:fin],
                "inicio": inicio,
                "fin": fin,
                "aporte": aporte_campo[campo],
            }
        ]

    # Desde donde no se leyo cada campo cortado por el limite de tokens. Los
    # recortes son prefijos del texto original, asi que los offsets calzan.
    no_leido: dict[str, int] = {}
    for campo in CAMPOS_MODELO:
        original = valores[campo] or ""
        leido = leidos[campo]
        if leido is None and original.strip():
            no_leido[campo] = 0
        elif leido is not None and len(leido) < len(original):
            no_leido[campo] = len(leido)

    return {"palabras": resultado, "no_leido": no_leido}


def _sin_avance(fase: str, hechos: int, total: int) -> None:
    return None


# ---------------------------------------------------------------- orquestador --
def explicar(
    priorizador: Any,
    valores: dict[str, str | None],
    *,
    avance: Avance | None = None,
) -> dict[str, Any]:
    """Explica la prioridad que el modelo sugiere para estos campos.

    Se explica la sugerencia del modelo, no la prioridad vigente: si esa la
    forzo una bandera roja o la cambio un medico, no salio del modelo. La
    explicacion lleva su clase, version y fecha, para saber cuando queda vieja.
    """
    if not modelo_disponible(priorizador):
        raise ExplicabilidadNoDisponibleError(
            "La explicación necesita el modelo cargado en el backend. Con "
            "MODEL_SERVICE_URL las predicciones vienen del servicio externo, "
            "que todavía no expone explicaciones."
        )
    avance = avance or _sin_avance
    with _cerrojo:
        inicio = time.perf_counter()
        recursos = priorizador.recursos()
        lote = settings.model_batch_size

        texto, palabras = armar_texto(valores)
        probabilidades = _probabilidades(recursos, [texto], lote)[0]
        indice_clase = int(probabilidades.argmax())
        leidos = recortar_a_lo_leido(valores, palabras, _leido_hasta(recursos, texto))
        cuerpo = _shap_por_campo(recursos, valores, leidos, indice_clase, lote, avance)
        cuerpo |= _peso_de_palabras(
            recursos, valores, leidos, cuerpo["campos"], indice_clase, lote, avance
        )

        return {
            "version": VERSION_EXPLICACION,
            "clase": recursos.labels[indice_clase],
            "probabilidades": {
                clase: round(float(p) * 100, 2)
                for clase, p in zip(recursos.labels, probabilidades, strict=True)
            },
            "generada_en": utc_now().isoformat(),
            "segundos": round(time.perf_counter() - inicio, 1),
            **cuerpo,
        }
