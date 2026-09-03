"""Tests de las funciones puras de `app/services/priorizador.py`.

El nucleo del producto estaba siempre reemplazado por un doble: nada cubria el
mapeo de clases, que es el punto mas riesgoso del sistema (README:114-117). Si el
orden de labels no coincide con el `LabelEncoder` del entrenamiento, todas las
probabilidades quedan asignadas a la prioridad equivocada.

Nada de esto necesita GPU ni descargar el modelo: se arma un config falso.
"""

from typing import Any

import pytest

from app.models.interconsulta import Interconsulta
from app.schemas.priorizacion import ProbabilidadesPrioridad, ResultadoPriorizacion
from app.services.priorizador import (
    FALLBACK_ID2LABEL,
    ModeloConfiguracion,
    PriorizadorRigoBerta,
    aplicar_resultado,
    construir_texto,
    get_priorizador,
    normalizar_clase,
)


class ConfigFalsa:
    def __init__(
        self,
        id2label: dict[Any, str | None] | None,
        num_labels: int | None = None,
    ) -> None:
        self.id2label = id2label
        self.num_labels = num_labels if num_labels is not None else len(id2label or {})


class ModeloFalso:
    def __init__(self, config: ConfigFalsa) -> None:
        self.config = config


def _priorizador(
    id2label: dict[Any, str | None] | None,
    num_labels: int | None = None,
) -> PriorizadorRigoBerta:
    priorizador = PriorizadorRigoBerta(
        ModeloConfiguracion(path="/models", max_length=512, batch_size=16),
    )
    priorizador._model = ModeloFalso(ConfigFalsa(id2label, num_labels))
    return priorizador


# --------------------------------------------------------------------------
# normalizar_clase
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("ALTA", "alta"),
        ("  Media  ", "media"),
        ("BAJA", "baja"),
        ("Médía", "media"),
        ("ALTÁ", "alta"),
    ],
)
def test_normalizar_clase_quita_tildes_mayusculas_y_espacios(
    entrada: str, esperado: str
) -> None:
    assert normalizar_clase(entrada) == esperado


# --------------------------------------------------------------------------
# _resolver_labels
# --------------------------------------------------------------------------


def test_resolver_labels_usa_los_del_modelo_cuando_son_validos() -> None:
    priorizador = _priorizador({0: "baja", 1: "media", 2: "alta"})

    assert priorizador._resolver_labels() == ["baja", "media", "alta"]


def test_resolver_labels_respeta_el_orden_del_modelo() -> None:
    # El caso que importa: si el modelo se entreno con las clases en otro orden,
    # el mapeo debe seguir ESE orden y no el de PRIORITY_ORDER. Asumir un orden
    # fijo es lo que asignaria cada probabilidad a la prioridad equivocada.
    priorizador = _priorizador({0: "alta", 1: "baja", 2: "media"})

    assert priorizador._resolver_labels() == ["alta", "baja", "media"]


def test_resolver_labels_normaliza_tildes_y_mayusculas() -> None:
    priorizador = _priorizador({0: "BAJA", 1: "Médía", 2: " Alta "})

    assert priorizador._resolver_labels() == ["baja", "media", "alta"]


def test_resolver_labels_acepta_claves_string() -> None:
    # transformers serializa id2label con claves string al leer config.json.
    priorizador = _priorizador(
        {"0": "baja", "1": "media", "2": "alta"},
        num_labels=3,
    )

    assert priorizador._resolver_labels() == ["baja", "media", "alta"]


def test_resolver_labels_cae_al_fallback_con_labels_genericos() -> None:
    priorizador = _priorizador({0: "LABEL_0", 1: "LABEL_1", 2: "LABEL_2"})

    assert priorizador._resolver_labels() == ["baja", "media", "alta"]


def test_resolver_labels_cae_al_fallback_sin_id2label() -> None:
    priorizador = _priorizador(None, num_labels=3)

    assert priorizador._resolver_labels() == ["baja", "media", "alta"]


def test_resolver_labels_cae_al_fallback_con_un_label_desconocido() -> None:
    # Basta que UNO no sea una prioridad conocida para desconfiar de todos.
    priorizador = _priorizador({0: "baja", 1: "media", 2: "urgentisima"})

    assert priorizador._resolver_labels() == ["baja", "media", "alta"]


def test_resolver_labels_falla_si_el_modelo_no_tiene_tres_clases() -> None:
    priorizador = _priorizador({0: "LABEL_0", 1: "LABEL_1"})

    with pytest.raises(ValueError, match="no coincide con FALLBACK_ID2LABEL"):
        priorizador._resolver_labels()


def test_fallback_id2label_cubre_las_tres_prioridades() -> None:
    assert sorted(FALLBACK_ID2LABEL.values()) == ["alta", "baja", "media"]


# --------------------------------------------------------------------------
# construir_texto
# --------------------------------------------------------------------------


def _interconsulta(**campos: object) -> Interconsulta:
    valores: dict[str, object] = {
        "id": "ic-texto",
        "espec_origen": "MEDICINA GENERAL",
        "edad": 46,
        "sexo": "FEMENINO",
        "espec_destino": "CARDIOLOGIA",
        "historia_clinica": "HTA",
        "fundamentos_diagnostico": "Disnea",
        "examenes_complementarios": "ECG",
        "motivo_interconsulta": "Control",
    }
    valores.update(campos)
    return Interconsulta(**valores)


def test_construir_texto_respeta_el_orden_de_los_campos() -> None:
    texto = construir_texto(_interconsulta())

    assert texto == "MEDICINA GENERAL 46 FEMENINO CARDIOLOGIA HTA Disnea ECG Control"


def test_construir_texto_colapsa_espacios_y_saltos_de_linea() -> None:
    texto = construir_texto(
        _interconsulta(
            historia_clinica="HTA   DM2",
            fundamentos_diagnostico="Informe:\napoyo\tclinico",
        )
    )

    assert "HTA DM2" in texto
    assert "Informe: apoyo clinico" in texto
    assert "\n" not in texto
    assert "  " not in texto


def test_construir_texto_no_rompe_con_examenes_en_none() -> None:
    # examenes_complementarios es el unico campo opcional del prompt. Al
    # reemplazarse por "" queda un espacio doble en el texto que ve el modelo:
    # comportamiento actual, fijado aca para que cambiarlo sea deliberado.
    texto = construir_texto(_interconsulta(examenes_complementarios=None))

    assert texto == "MEDICINA GENERAL 46 FEMENINO CARDIOLOGIA HTA Disnea  Control"


def test_construir_texto_omite_los_campos_none() -> None:
    texto = construir_texto(_interconsulta(historia_clinica=None))

    assert "HTA" not in texto
    assert "Disnea" in texto


def test_construir_texto_incluye_la_edad_como_texto() -> None:
    texto = construir_texto(_interconsulta(edad=7))

    assert " 7 " in texto


# --------------------------------------------------------------------------
# _crear_resultado
# --------------------------------------------------------------------------


def _con_labels(labels: list[str]) -> PriorizadorRigoBerta:
    priorizador = _priorizador({0: "baja", 1: "media", 2: "alta"})
    priorizador._label_names = labels
    return priorizador


def test_crear_resultado_elige_la_clase_mas_probable() -> None:
    priorizador = _con_labels(["baja", "media", "alta"])

    resultado = priorizador._crear_resultado("ic-1", [0.1, 0.7, 0.2])

    assert resultado.id == "ic-1"
    assert resultado.prioridad == "media"
    assert resultado.confianza == 70.0


def test_crear_resultado_mapea_por_nombre_y_no_por_posicion() -> None:
    # Con los labels invertidos, la probabilidad alta esta en la posicion 0.
    # Si el mapeo fuera posicional, esto devolveria "baja".
    priorizador = _con_labels(["alta", "media", "baja"])

    resultado = priorizador._crear_resultado("ic-2", [0.9, 0.07, 0.03])

    assert resultado.prioridad == "alta"
    assert resultado.confianza == 90.0
    assert resultado.probabilidades.alta == 90.0
    assert resultado.probabilidades.baja == 3.0


def test_crear_resultado_redondea_a_dos_decimales() -> None:
    priorizador = _con_labels(["baja", "media", "alta"])

    resultado = priorizador._crear_resultado("ic-3", [0.0487655, 0.05, 0.9012345])

    assert resultado.probabilidades.baja == 4.88
    assert resultado.probabilidades.media == 5.0
    assert resultado.probabilidades.alta == 90.12
    assert resultado.confianza == 90.12


def test_crear_resultado_ante_empate_devuelve_la_prioridad_mas_baja() -> None:
    # Comportamiento actual: `max` sobre PRIORITY_ORDER devuelve el primer
    # maximo, y PRIORITY_ORDER empieza en "baja". Documentado para que un cambio
    # de criterio sea deliberado y no un efecto colateral.
    priorizador = _con_labels(["baja", "media", "alta"])

    resultado = priorizador._crear_resultado("ic-4", [1 / 3, 1 / 3, 1 / 3])

    assert resultado.prioridad == "baja"


def test_predecir_sin_interconsultas_no_carga_el_modelo() -> None:
    # Cortocircuito: sin esto, una lista vacia intentaria bajar el modelo.
    priorizador = PriorizadorRigoBerta(
        ModeloConfiguracion(path="/models", max_length=512, batch_size=16),
    )

    assert priorizador.predecir([]) == []


# --------------------------------------------------------------------------
# aplicar_resultado
# --------------------------------------------------------------------------


def _resultado(prioridad: str = "alta") -> ResultadoPriorizacion:
    return ResultadoPriorizacion(
        id="ic-aplicar",
        prioridad=prioridad,
        confianza=88.0,
        probabilidades=ProbabilidadesPrioridad(baja=4.0, media=8.0, alta=88.0),
    )


def test_aplicar_resultado_vuelca_la_prediccion() -> None:
    interconsulta = _interconsulta(id="ic-aplicar", prioridad_actual="baja")

    aplicar_resultado(interconsulta, _resultado())

    assert interconsulta.prioridad_sugerida_modelo == "alta"
    assert interconsulta.confianza_modelo == 88.0
    assert interconsulta.prob_baja == 4.0
    assert interconsulta.prob_media == 8.0
    assert interconsulta.prob_alta == 88.0
    assert interconsulta.prioridad_actual == "alta"


def test_aplicar_resultado_limpia_el_motivo_sin_prioridad() -> None:
    interconsulta = _interconsulta(
        id="ic-aplicar",
        motivo_sin_prioridad="No se pudo ejecutar el modelo predictivo: simulado",
    )

    aplicar_resultado(interconsulta, _resultado())

    assert interconsulta.motivo_sin_prioridad is None


def test_aplicar_resultado_no_pisa_la_prioridad_forzada_por_regla() -> None:
    # D5 / HU5-c3: la regla determinista de banderas rojas manda sobre el modelo.
    interconsulta = _interconsulta(
        id="ic-aplicar",
        prioridad_actual="alta",
        prioridad_forzada_por_regla=True,
    )

    aplicar_resultado(interconsulta, _resultado(prioridad="baja"))

    assert interconsulta.prioridad_actual == "alta"
    # La sugerencia igual se registra, para que el medico vea ambas.
    assert interconsulta.prioridad_sugerida_modelo == "baja"


# --------------------------------------------------------------------------
# predecir: orquestacion (sin torch)
# --------------------------------------------------------------------------


def test_predecir_arma_un_resultado_por_interconsulta(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    priorizador = _con_labels(["baja", "media", "alta"])
    textos_vistos: list[list[str]] = []

    def _predecir_textos(textos: list[str]) -> list[list[float]]:
        textos_vistos.append(textos)
        return [[0.1, 0.2, 0.7] for _ in textos]

    monkeypatch.setattr(priorizador, "_cargar_modelo", lambda: None)
    monkeypatch.setattr(priorizador, "_predecir_textos", _predecir_textos)

    interconsultas = [
        _interconsulta(id="ic-a", historia_clinica="HTA"),
        _interconsulta(id="ic-b", historia_clinica="DM2"),
    ]
    resultados = priorizador.predecir(interconsultas)

    assert [resultado.id for resultado in resultados] == ["ic-a", "ic-b"]
    assert all(resultado.prioridad == "alta" for resultado in resultados)
    # El texto que ve el modelo es el que arma construir_texto, en el mismo orden.
    assert textos_vistos == [
        [construir_texto(interconsultas[0]), construir_texto(interconsultas[1])]
    ]


def test_get_priorizador_devuelve_siempre_la_misma_instancia() -> None:
    # Es la dependencia que inyecta FastAPI: si devolviera una instancia nueva por
    # request, cada request volveria a cargar el modelo.
    assert get_priorizador() is get_priorizador()
    assert isinstance(get_priorizador(), PriorizadorRigoBerta)


# --------------------------------------------------------------------------
# MODEL_LABELS: orden de clases fijado por configuracion
# --------------------------------------------------------------------------


def _priorizador_con_labels(
    id2label: dict[Any, str | None] | None,
    labels: tuple[str, ...],
    num_labels: int | None = None,
) -> PriorizadorRigoBerta:
    priorizador = PriorizadorRigoBerta(
        ModeloConfiguracion(
            path="/models", max_length=512, batch_size=16, labels=labels
        ),
    )
    priorizador._model = ModeloFalso(ConfigFalsa(id2label, num_labels))
    return priorizador


def test_model_labels_fija_el_orden_cuando_el_modelo_no_lo_declara() -> None:
    """El modelo real trae LABEL_0/1/2 y hoy se cae a FALLBACK_ID2LABEL, que es
    una suposicion: si no coincide con el entrenamiento, todas las prioridades
    quedan mal asignadas. MODEL_LABELS permite fijar el orden real."""
    priorizador = _priorizador_con_labels(
        {0: "LABEL_0", 1: "LABEL_1", 2: "LABEL_2"},
        labels=("alta", "media", "baja"),
    )

    assert priorizador._resolver_labels() == ["alta", "media", "baja"]


def test_model_labels_manda_sobre_los_labels_del_modelo() -> None:
    priorizador = _priorizador_con_labels(
        {0: "baja", 1: "media", 2: "alta"},
        labels=("alta", "media", "baja"),
    )

    assert priorizador._resolver_labels() == ["alta", "media", "baja"]


def test_model_labels_normaliza_tildes_y_mayusculas() -> None:
    priorizador = _priorizador_con_labels(
        {0: "LABEL_0", 1: "LABEL_1", 2: "LABEL_2"},
        labels=("ALTA", "  Médía  ", "Baja"),
    )

    assert priorizador._resolver_labels() == ["alta", "media", "baja"]


def test_model_labels_con_cantidad_distinta_a_la_del_modelo_falla() -> None:
    priorizador = _priorizador_con_labels(
        {0: "LABEL_0", 1: "LABEL_1", 2: "LABEL_2"},
        labels=("alta", "baja"),
    )

    with pytest.raises(ValueError, match="MODEL_LABELS define 2 clases"):
        priorizador._resolver_labels()


def test_model_labels_con_una_clase_desconocida_falla() -> None:
    priorizador = _priorizador_con_labels(
        {0: "LABEL_0", 1: "LABEL_1", 2: "LABEL_2"},
        labels=("alta", "media", "urgente"),
    )

    with pytest.raises(ValueError, match="clases desconocidas"):
        priorizador._resolver_labels()


def test_el_fallback_avisa_por_log_que_esta_suponiendo_el_orden(
    caplog: pytest.LogCaptureFixture,
) -> None:
    priorizador = _priorizador(
        {0: "LABEL_0", 1: "LABEL_1", 2: "LABEL_2"},
    )

    with caplog.at_level("WARNING"):
        assert priorizador._resolver_labels() == ["baja", "media", "alta"]

    assert "MODEL_LABELS" in caplog.text


# --------------------------------------------------------------------------
# _predecir_textos: batching y softmax
# --------------------------------------------------------------------------


class TokenizadorFalso:
    """Devuelve el propio lote; lo unico que importa es cuantos textos entraron."""

    def __init__(self) -> None:
        self.lotes: list[list[str]] = []

    def __call__(self, batch: list[str], **_: Any) -> Any:
        self.lotes.append(list(batch))
        return self

    def to(self, _device: Any) -> Any:
        return self

    def keys(self) -> Any:
        return {"textos": None}.keys()

    def __getitem__(self, clave: str) -> Any:
        return self.lotes[-1]


class ModeloConLogits:
    """Un logit distinto por texto, para poder afirmar el orden de la salida."""

    def __init__(self, logits_por_texto: list[list[float]]) -> None:
        self.logits_por_texto = logits_por_texto
        self.consumidos = 0

    def __call__(self, **kwargs: Any) -> Any:
        import torch

        cantidad = len(kwargs["textos"])
        trozo = self.logits_por_texto[self.consumidos : self.consumidos + cantidad]
        self.consumidos += cantidad

        class Salida:
            logits = torch.tensor(trozo)

        return Salida()


def test_predecir_textos_respeta_el_tamano_de_lote() -> None:
    priorizador = PriorizadorRigoBerta(
        ModeloConfiguracion(path="/models", max_length=512, batch_size=2),
    )
    tokenizador = TokenizadorFalso()
    priorizador._tokenizer = tokenizador
    priorizador._model = ModeloConLogits([[0.0, 0.0, 1.0]] * 5)
    priorizador._device = "cpu"

    probs = priorizador._predecir_textos([f"texto {i}" for i in range(5)])

    assert [len(lote) for lote in tokenizador.lotes] == [2, 2, 1]
    assert probs.shape == (5, 3)


def test_predecir_textos_devuelve_probabilidades_que_suman_uno() -> None:
    priorizador = PriorizadorRigoBerta(
        ModeloConfiguracion(path="/models", max_length=512, batch_size=16),
    )
    priorizador._tokenizer = TokenizadorFalso()
    priorizador._model = ModeloConLogits([[2.0, 1.0, 0.0], [0.0, 0.0, 5.0]])
    priorizador._device = "cpu"

    probs = priorizador._predecir_textos(["a", "b"])

    assert probs[0].sum().item() == pytest.approx(1.0)
    # El softmax conserva el orden: el logit mas alto sigue siendo el mayor.
    assert probs[0].argmax().item() == 0
    assert probs[1].argmax().item() == 2
