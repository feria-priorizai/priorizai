"""Explicabilidad: armado del texto, recorte a lo que el modelo leyo, SHAP por
campo, el peso de cada palabra, la cola en segundo plano y los endpoints.

SHAP se ejecuta de verdad sobre un BERT diminuto de pesos aleatorios y un
tokenizador armado en memoria: los 2 GB del modelo real no estan en el CI, y un
doble que no calcule nada no probaria lo que importa (que SHAP cumpla la
eficiencia, que lo truncado no reciba aporte).
"""

import re
import threading
from collections.abc import Callable, Iterator
from typing import Any

import pytest
import torch
from fastapi.testclient import TestClient
from tokenizers import Tokenizer, models, pre_tokenizers, processors
from transformers import (
    BertConfig,
    BertForSequenceClassification,
    PreTrainedTokenizerFast,
)

from app.main import app
from app.models.interconsulta import Interconsulta
from app.schemas.explicacion import VERSION_EXPLICACION, ExplicacionShap
from app.services import explicabilidad
from app.services.cola_explicaciones import ColaExplicaciones, get_cola
from app.services.explicabilidad import (
    ExplicabilidadNoDisponibleError,
    armar_texto,
    explicar,
    recortar_a_lo_leido,
    valores_de_interconsulta,
)
from app.services.priorizador import RecursosModelo, construir_texto, get_priorizador

ESPECIALES = ["[PAD]", "[UNK]", "[CLS]", "[SEP]"]
ESPERA = 10.0


def _interconsulta(**campos: Any) -> Interconsulta:
    valores: dict[str, Any] = {
        "id": "ic-x",
        "espec_origen": "MEDICINA GENERAL",
        "edad": 67,
        "sexo": "MASCULINO",
        "espec_destino": "CIRUGIA DIGESTIVA",
        "historia_clinica": "HEMORRAGIA DIGESTIVA  ALTA.",
        "fundamentos_diagnostico": "Consulta por melena\tde tres dias.",
        "examenes_complementarios": "",
        "motivo_interconsulta": "REALIZAR TRATAMIENTO",
    }
    valores.update(campos)
    return Interconsulta(**valores)


def _valores(**campos: Any) -> dict[str, str | None]:
    return valores_de_interconsulta(_interconsulta(**campos))


# -------------------------------------------------------------- armar_texto --
@pytest.mark.parametrize(
    "campos",
    [
        {},
        {"historia_clinica": "  espacios\n\nal   inicio y al final  "},
        {"examenes_complementarios": None},
        {"examenes_complementarios": "Hb 8,2 g/dL"},
        {"fundamentos_diagnostico": "   "},
        {"historia_clinica": None},
    ],
)
def test_armar_texto_es_identico_a_construir_texto(campos: dict[str, Any]) -> None:
    """Si difiere en un solo espacio, se explica otra prediccion."""
    interconsulta = _interconsulta(**campos)
    texto, _ = armar_texto(valores_de_interconsulta(interconsulta))
    assert texto == construir_texto(interconsulta)


def test_cada_palabra_se_ubica_en_los_dos_textos() -> None:
    valores = _valores(historia_clinica="  dolor\t\topresivo\nirradiado ")
    texto, palabras = armar_texto(valores)

    for palabra in palabras:
        original = valores[palabra.campo] or ""
        assert (
            texto[palabra.inicio_modelo : palabra.fin_modelo]
            == original[palabra.inicio : palabra.fin]
        )
    historia_original = valores["historia_clinica"] or ""
    historia = [p for p in palabras if p.campo == "historia_clinica"]
    assert [historia_original[p.inicio : p.fin] for p in historia] == [
        "dolor",
        "opresivo",
        "irradiado",
    ]


# ------------------------------------------------------- recortar_a_lo_leido --
def test_recortar_corta_el_campo_parcial_y_anula_los_que_no_se_leyeron() -> None:
    valores = _valores(
        fundamentos_diagnostico="uno  dos tres",
        examenes_complementarios="cuatro",
    )
    texto, palabras = armar_texto(valores)
    hasta = texto.index("dos") + len("dos")

    recortados = recortar_a_lo_leido(valores, palabras, hasta)

    assert recortados["historia_clinica"] == valores["historia_clinica"]
    assert recortados["fundamentos_diagnostico"] == "uno  dos"
    assert recortados["examenes_complementarios"] is None
    assert recortados["motivo_interconsulta"] is None
    # La coalicion completa es justo lo que el modelo leyo, sin espacios de mas.
    assert armar_texto(recortados)[0] == texto[:hasta]


def test_recortar_corta_una_palabra_partida_por_el_limite() -> None:
    valores = _valores(motivo_interconsulta="TRATAMIENTO")
    texto, palabras = armar_texto(valores)
    hasta = texto.index("TRATAMIENTO") + 5

    recortados = recortar_a_lo_leido(valores, palabras, hasta)

    assert recortados["motivo_interconsulta"] == "TRATA"


def test_recortar_no_toca_nada_si_se_leyo_todo() -> None:
    valores = _valores()
    texto, palabras = armar_texto(valores)
    assert recortar_a_lo_leido(valores, palabras, len(texto)) == valores


# ------------------------------------------------------ SHAP de verdad, en chico --
def _tokenizador(textos: list[str]) -> PreTrainedTokenizerFast:
    palabras = sorted(
        {t for texto in textos for t in re.findall(r"\w+|[^\w\s]+", texto)}
    )
    vocab = {token: i for i, token in enumerate(ESPECIALES + palabras)}
    tokenizer = Tokenizer(models.WordLevel(vocab, unk_token="[UNK]"))
    tokenizer.pre_tokenizer = pre_tokenizers.Whitespace()
    tokenizer.post_processor = processors.TemplateProcessing(
        single="[CLS] $A [SEP]",
        special_tokens=[("[CLS]", vocab["[CLS]"]), ("[SEP]", vocab["[SEP]"])],
    )
    return PreTrainedTokenizerFast(
        tokenizer_object=tokenizer,
        pad_token="[PAD]",
        unk_token="[UNK]",
        cls_token="[CLS]",
        sep_token="[SEP]",
    )


class PriorizadorDiminuto:
    """Mismo contrato que PriorizadorRigoBerta.recursos(), con un BERT de dos
    capas y pesos aleatorios fijos."""

    def __init__(self, valores: dict[str, str | None], max_length: int = 128) -> None:
        tokenizer = _tokenizador([armar_texto(valores)[0]])
        torch.manual_seed(0)
        model = BertForSequenceClassification(
            BertConfig(
                vocab_size=len(tokenizer.get_vocab()),
                hidden_size=16,
                num_hidden_layers=2,
                num_attention_heads=2,
                intermediate_size=32,
                max_position_embeddings=max_length,
                num_labels=3,
            )
        ).eval()
        self._recursos = RecursosModelo(
            tokenizer=tokenizer,
            model=model,
            device=torch.device("cpu"),
            labels=("baja", "media", "alta"),
            max_length=max_length,
        )

    def recursos(self) -> RecursosModelo:
        return self._recursos


class Registro:
    """Junta lo que explicar() va informando, en orden."""

    def __init__(self) -> None:
        self.eventos: list[tuple[str, int, int]] = []

    def avance(self, fase: str, hechos: int, total: int) -> None:
        self.eventos.append((fase, hechos, total))


def test_shap_devuelve_un_contrato_valido_y_coherente() -> None:
    valores = _valores()
    resultado = explicar(PriorizadorDiminuto(valores), valores)

    ExplicacionShap.model_validate(resultado)
    assert resultado["version"] == VERSION_EXPLICACION
    assert resultado["clase"] == max(
        resultado["probabilidades"], key=resultado["probabilidades"].get
    )
    assert resultado["segundos"] >= 0
    assert resultado["generada_en"]
    assert resultado["coaliciones"] == 256
    # Eficiencia: los aportes suman exactamente la prediccion menos la base.
    suma = resultado["base"] + sum(c["aporte"] for c in resultado["campos"])
    assert suma == pytest.approx(resultado["final"], abs=0.01)
    # Y la prediccion es la probabilidad de la clase: la confianza del modelo.
    assert resultado["final"] == pytest.approx(
        resultado["probabilidades"][resultado["clase"]], abs=0.01
    )
    # Un campo vacio esta igual presente que ausente: su aporte es exactamente 0,
    # y su presencia no agrega textos distintos (128 en vez de 256).
    examenes = next(
        c for c in resultado["campos"] if c["campo"] == "examenes_complementarios"
    )
    assert examenes == {
        "campo": "examenes_complementarios",
        "aporte": 0.0,
        "vacio": True,
        "no_leido": False,
    }
    assert resultado["evaluadas"] == 128


def test_cada_palabra_leida_tiene_su_peso_ubicado_en_el_texto_original() -> None:
    valores = _valores()
    resultado = explicar(PriorizadorDiminuto(valores), valores)

    _, palabras = armar_texto(valores)
    libres = [p for p in palabras if p.campo not in explicabilidad.CAMPOS_ENTEROS]
    assert sum(
        len(propias)
        for campo, propias in resultado["palabras"].items()
        if campo not in explicabilidad.CAMPOS_ENTEROS
    ) == len(libres)
    for campo, propias in resultado["palabras"].items():
        original = valores[campo] or ""
        for palabra in propias:
            assert original[palabra["inicio"] : palabra["fin"]] == palabra["texto"]
    # "ALTA." es una sola palabra, aunque el tokenizador la parta en dos.
    historia = [p["texto"] for p in resultado["palabras"]["historia_clinica"]]
    assert historia == ["HEMORRAGIA", "DIGESTIVA", "ALTA."]
    assert "examenes_complementarios" not in resultado["palabras"]
    assert resultado["no_leido"] == {}


def test_los_campos_que_son_un_valor_van_enteros_con_su_aporte() -> None:
    """Borrar "MEDICINA" de "MEDICINA GENERAL" deja una especialidad que no
    existe. Y un campo de una sola palabra es esa palabra: mostrar otra cifra
    al lado del total confundiria."""
    valores = _valores(motivo_interconsulta="SEGUIMIENTO")
    resultado = explicar(PriorizadorDiminuto(valores), valores)

    aportes = {c["campo"]: c["aporte"] for c in resultado["campos"]}
    for campo in (
        "espec_origen",
        "edad",
        "sexo",
        "espec_destino",
        "motivo_interconsulta",
    ):
        (entero,) = resultado["palabras"][campo]
        assert entero["texto"] == (valores[campo] or "").strip()
        assert entero["aporte"] == aportes[campo]


def test_el_peso_de_una_palabra_es_lo_que_cambia_al_borrarla() -> None:
    valores = _valores()
    priorizador = PriorizadorDiminuto(valores)
    resultado = explicar(priorizador, valores)

    clase = list(resultado["probabilidades"]).index(resultado["clase"])
    sin_melena = dict(valores, fundamentos_diagnostico="Consulta por de tres dias.")
    completo, sin = explicabilidad._probabilidades(
        priorizador.recursos(),
        [armar_texto(valores)[0], armar_texto(sin_melena)[0]],
        lote=2,
    )
    melena = next(
        p
        for p in resultado["palabras"]["fundamentos_diagnostico"]
        if p["texto"] == "melena"
    )
    assert melena["aporte"] == pytest.approx(
        (completo[clase] - sin[clase]) * 100, abs=0.001
    )


def test_shap_es_determinista() -> None:
    """Es Shapley exacto, no muestreo: dos ejecuciones dan lo mismo."""
    valores = _valores()
    priorizador = PriorizadorDiminuto(valores)

    primera = explicar(priorizador, valores)
    segunda = explicar(priorizador, valores)

    assert primera["campos"] == segunda["campos"]
    assert primera["base"] == segunda["base"]


def test_lo_que_el_modelo_no_leyo_no_recibe_aporte() -> None:
    """Con el texto truncado, un campo que quedo entero fuera del limite no
    influyo en la prediccion: SHAP le da cero y lo marca, aunque en coaliciones
    con menos campos su texto si hubiera cabido.

    Con 18 tokens (16 de texto) el corte cae en "dias." de los fundamentos:
    "dias" entra y el punto no. Examenes y motivo quedan enteros fuera.
    """
    valores = _valores(examenes_complementarios="hemograma normal")

    shap = explicar(PriorizadorDiminuto(valores, max_length=18), valores)

    campos = {c["campo"]: c for c in shap["campos"]}
    for campo in ("examenes_complementarios", "motivo_interconsulta"):
        assert campos[campo]["aporte"] == 0.0
        assert campos[campo]["no_leido"] is True
        assert campos[campo]["vacio"] is False
    # Leido en parte: aporta lo que alcanzo a leerse, no se marca como no leido.
    assert campos["fundamentos_diagnostico"]["no_leido"] is False
    # Dos campos que no cambian el texto: 2^6 = 64 textos distintos.
    assert shap["evaluadas"] == 64
    # La coalicion completa es la entrada real: SHAP termina en la prediccion.
    assert shap["final"] == pytest.approx(
        shap["probabilidades"][shap["clase"]], abs=0.01
    )
    suma = shap["base"] + sum(c["aporte"] for c in shap["campos"])
    assert suma == pytest.approx(shap["final"], abs=0.01)
    # Las palabras tampoco: se marca desde donde no se leyo cada campo.
    assert shap["palabras"]["fundamentos_diagnostico"][-1]["texto"] == "dias"
    assert "motivo_interconsulta" not in shap["palabras"]
    fundamentos = valores["fundamentos_diagnostico"] or ""
    assert fundamentos[shap["no_leido"]["fundamentos_diagnostico"] :] == "."
    assert shap["no_leido"]["examenes_complementarios"] == 0
    assert shap["no_leido"]["motivo_interconsulta"] == 0


def test_informa_su_avance() -> None:
    valores = _valores()
    registro = Registro()

    explicar(PriorizadorDiminuto(valores), valores, avance=registro.avance)

    fases = [fase for fase, _, _ in registro.eventos]
    assert fases == sorted(fases, key=["calculando", "palabras"].index)
    assert registro.eventos[0] == ("calculando", 0, 128)
    assert ("calculando", 128, 128) in registro.eventos
    # Palabras de texto libre en campos de mas de una: 3 + 6 + 2.
    assert registro.eventos[-1] == ("palabras", 11, 11)


def test_sin_modelo_en_proceso_no_hay_explicacion() -> None:
    class Remoto:
        def predecir(self, interconsultas: list[Interconsulta]) -> list[Any]:
            return []

    assert explicabilidad.modelo_disponible(Remoto()) is False
    with pytest.raises(ExplicabilidadNoDisponibleError, match="MODEL_SERVICE_URL"):
        explicar(Remoto(), _valores())


# --------------------------------------------------------------------- cola --
def _shap(clase: str = "alta", version: int = VERSION_EXPLICACION) -> dict:
    return {
        "version": version,
        "clase": clase,
        "probabilidades": {"baja": 2.0, "media": 6.5, "alta": 91.5},
        "generada_en": "2026-10-02T12:00:00+00:00",
        "segundos": 1.5,
        "base": 50.0,
        "final": 91.5,
        "coaliciones": 256,
        "evaluadas": 128,
        "campos": [
            {
                "campo": "historia_clinica",
                "aporte": 41.5,
                "vacio": False,
                "no_leido": False,
            },
        ],
        "palabras": {
            "historia_clinica": [
                {"texto": "Antecedentes", "inicio": 0, "fin": 12, "aporte": 30.2},
                {"texto": "clinicos", "inicio": 13, "fin": 21, "aporte": 8.4},
            ]
        },
        "no_leido": {},
    }


class ExplicarControlado:
    """Reemplaza el calculo pesado. Informa avance y despues espera a que el
    test lo libere: asi se puede mirar el estado a mitad de camino."""

    def __init__(self, falla: Exception | None = None) -> None:
        self.liberar = threading.Event()
        self.en_curso = threading.Event()
        self.llamadas: list[dict[str, str | None]] = []
        self.falla = falla

    def __call__(
        self,
        priorizador: Any,
        valores: dict[str, str | None],
        *,
        avance: Any = None,
    ) -> dict:
        self.llamadas.append(valores)
        avance("calculando", 40, 128)
        self.en_curso.set()
        assert self.liberar.wait(ESPERA)
        if self.falla is not None:
            raise self.falla
        return _shap()


@pytest.fixture
def explicar_controlado(monkeypatch: pytest.MonkeyPatch) -> ExplicarControlado:
    controlado = ExplicarControlado()
    monkeypatch.setattr(explicabilidad, "explicar", controlado)
    return controlado


def test_la_cola_calcula_guarda_y_olvida(
    explicar_controlado: ExplicarControlado,
) -> None:
    cola = ColaExplicaciones()
    guardados: list[dict] = []

    estado = cola.encolar("ic-1", {"a": "b"}, object(), guardados.append)
    assert estado["estado"] in {"en_cola", "calculando"}

    assert explicar_controlado.en_curso.wait(ESPERA)
    a_mitad = cola.estado("ic-1")
    assert a_mitad is not None
    assert a_mitad["estado"] == "calculando"
    assert a_mitad["progreso"] == {"fase": "calculando", "hechos": 40, "total": 128}
    assert cola.estado("ic-2") is None

    explicar_controlado.liberar.set()
    assert cola.esperar(ESPERA)
    assert guardados == [_shap()]
    # Guardado en la base: la cola ya no responde por el.
    assert cola.estado("ic-1") is None


def test_pedirla_dos_veces_no_la_calcula_dos_veces(
    explicar_controlado: ExplicarControlado,
) -> None:
    cola = ColaExplicaciones()
    cola.encolar("ic-1", {}, object(), lambda r: None)
    assert explicar_controlado.en_curso.wait(ESPERA)

    cola.encolar("ic-1", {}, object(), lambda r: None)

    explicar_controlado.liberar.set()
    assert cola.esperar(ESPERA)
    assert len(explicar_controlado.llamadas) == 1


def test_la_cola_informa_cuantas_hay_delante(
    explicar_controlado: ExplicarControlado,
) -> None:
    cola = ColaExplicaciones()
    cola.encolar("ic-1", {}, object(), lambda r: None)
    assert explicar_controlado.en_curso.wait(ESPERA)

    segunda = cola.encolar("ic-2", {}, object(), lambda r: None)
    tercera = cola.encolar("ic-3", {}, object(), lambda r: None)

    assert segunda["estado"] == "en_cola" and segunda["delante"] == 1
    assert tercera["delante"] == 2
    explicar_controlado.liberar.set()
    assert cola.esperar(ESPERA)
    assert len(explicar_controlado.llamadas) == 3


def test_un_error_queda_informado_hasta_que_se_pida_de_nuevo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    controlado = ExplicarControlado(falla=RuntimeError("memoria insuficiente"))
    monkeypatch.setattr(explicabilidad, "explicar", controlado)
    cola = ColaExplicaciones()
    guardados: list[dict] = []

    cola.encolar("ic-1", {}, object(), guardados.append)
    controlado.liberar.set()
    assert cola.esperar(ESPERA)

    estado = cola.estado("ic-1")
    assert estado is not None
    assert estado["estado"] == "error"
    assert "memoria insuficiente" in estado["error"]
    assert guardados == []

    controlado.falla = None
    cola.encolar("ic-1", {}, object(), guardados.append)
    assert cola.esperar(ESPERA)
    assert guardados == [_shap()]


# ------------------------------------------------------------------ endpoint --
class ConRecursos:
    """Priorizador con modelo local: lo que la cola necesita para aceptar."""

    def recursos(self) -> None:  # pragma: no cover - el calculo esta reemplazado
        return None


@pytest.fixture
def cola() -> Iterator[ColaExplicaciones]:
    nueva = ColaExplicaciones()
    yield nueva
    nueva.esperar(ESPERA)


@pytest.fixture
def client_explicable(client: TestClient, cola: ColaExplicaciones) -> TestClient:
    app.dependency_overrides[get_priorizador] = lambda: ConRecursos()
    app.dependency_overrides[get_cola] = lambda: cola
    return client


URL = "/api/interconsultas/ic-1/explicacion"


def test_pedirla_la_encola_y_despues_queda_guardada(
    client_explicable: TestClient,
    cola: ColaExplicaciones,
    guardar_interconsulta: Callable[..., Interconsulta],
    explicar_controlado: ExplicarControlado,
) -> None:
    guardar_interconsulta(id="ic-1", prioridad_sugerida_modelo="alta")

    respuesta = client_explicable.post(URL)
    assert respuesta.status_code == 202
    assert respuesta.json()["estado"] in {"en_cola", "calculando"}

    assert explicar_controlado.en_curso.wait(ESPERA)
    a_mitad = client_explicable.get(URL).json()
    assert a_mitad["estado"] == "calculando"
    assert a_mitad["progreso"]["fase"] == "calculando"

    explicar_controlado.liberar.set()
    assert cola.esperar(ESPERA)
    estado = client_explicable.get(URL).json()
    assert estado["estado"] == "lista"
    assert estado["resultado"]["final"] == 91.5
    detalle = client_explicable.get("/api/interconsultas/ic-1").json()
    assert detalle["explicacion"]["clase"] == "alta"
    assert explicar_controlado.llamadas[0]["historia_clinica"] == (
        "Antecedentes clinicos"
    )


def test_el_listado_no_trae_la_explicacion(
    client: TestClient,
    guardar_interconsulta: Callable[..., Interconsulta],
) -> None:
    guardar_interconsulta(id="ic-1", explicacion=_shap())

    fila = client.get("/api/interconsultas").json()[0]

    assert "explicacion" not in fila


def test_una_explicacion_vigente_se_devuelve_sin_recalcular(
    client_explicable: TestClient,
    guardar_interconsulta: Callable[..., Interconsulta],
    explicar_controlado: ExplicarControlado,
) -> None:
    guardar_interconsulta(
        id="ic-1", prioridad_sugerida_modelo="alta", explicacion=_shap()
    )

    respuesta = client_explicable.post(URL)

    assert respuesta.status_code == 200
    assert respuesta.json()["estado"] == "lista"
    assert explicar_controlado.llamadas == []


def test_forzar_recalcula(
    client_explicable: TestClient,
    guardar_interconsulta: Callable[..., Interconsulta],
    explicar_controlado: ExplicarControlado,
) -> None:
    guardar_interconsulta(
        id="ic-1", prioridad_sugerida_modelo="alta", explicacion=_shap()
    )

    respuesta = client_explicable.post(f"{URL}?forzar=true")

    assert respuesta.status_code == 202
    assert explicar_controlado.en_curso.wait(ESPERA)
    explicar_controlado.liberar.set()


def test_si_cambio_la_sugerencia_la_explicacion_guardada_queda_vieja(
    client_explicable: TestClient,
    guardar_interconsulta: Callable[..., Interconsulta],
    explicar_controlado: ExplicarControlado,
) -> None:
    """Explicaria una prioridad que el modelo ya no sugiere."""
    guardar_interconsulta(
        id="ic-1", prioridad_sugerida_modelo="media", explicacion=_shap(clase="alta")
    )

    assert client_explicable.get(URL).json()["estado"] == "sin_explicacion"
    respuesta = client_explicable.post(URL)
    assert respuesta.status_code == 202
    explicar_controlado.liberar.set()


@pytest.mark.parametrize(
    "guardada",
    [
        # v3: un SHAP y un Integrated Gradients, cada uno con su version.
        {"shap": _shap(version=3), "integrated_gradients": {"version": 3}},
        # v2: los dos metodos juntos, con una sola version afuera.
        {"version": 2, "clase": "alta", "shap": {"base": 1.0}},
        _shap(version=VERSION_EXPLICACION - 1),
    ],
)
def test_una_explicacion_de_otro_formato_se_ignora(
    client_explicable: TestClient,
    guardar_interconsulta: Callable[..., Interconsulta],
    guardada: dict,
) -> None:
    guardar_interconsulta(
        id="ic-1", prioridad_sugerida_modelo="alta", explicacion=guardada
    )

    detalle = client_explicable.get("/api/interconsultas/ic-1").json()
    assert detalle["explicacion"] is None
    assert client_explicable.get(URL).json()["estado"] == "sin_explicacion"


def test_un_error_del_calculo_llega_al_estado(
    client_explicable: TestClient,
    cola: ColaExplicaciones,
    guardar_interconsulta: Callable[..., Interconsulta],
    releer: Callable[[str], Interconsulta | None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    controlado = ExplicarControlado(falla=RuntimeError("memoria insuficiente"))
    controlado.liberar.set()
    monkeypatch.setattr(explicabilidad, "explicar", controlado)
    guardar_interconsulta(id="ic-1")

    client_explicable.post(URL)
    assert cola.esperar(ESPERA)

    estado = client_explicable.get(URL).json()
    assert estado["estado"] == "error"
    assert "memoria insuficiente" in estado["error"]
    guardada = releer("ic-1")
    assert guardada is not None and guardada.explicacion is None


def test_si_el_calculo_termina_justo_al_consultar_se_ve_la_explicacion(
    client_explicable: TestClient,
    guardar_interconsulta: Callable[..., Interconsulta],
    session_factory: Any,
) -> None:
    """La cola guarda en la base y recien despues olvida el trabajo. Si el GET
    leyera la interconsulta antes de preguntarle a la cola, un calculo que
    termina justo en medio la dejaria sin trabajo y con la lectura vieja:
    responderia sin_explicacion y la pagina dejaria de preguntar."""
    guardar_interconsulta(id="ic-1", prioridad_sugerida_modelo="alta")

    class TerminaAlConsultar(ColaExplicaciones):
        def estado(self, interconsulta_id: str) -> dict[str, Any] | None:
            with session_factory() as sesion:
                interconsulta = sesion.get(Interconsulta, interconsulta_id)
                interconsulta.explicacion = _shap()
                sesion.commit()
            return None

    app.dependency_overrides[get_cola] = lambda: TerminaAlConsultar()

    estado = client_explicable.get(URL).json()

    assert estado["estado"] == "lista"
    assert estado["resultado"]["clase"] == "alta"


def test_sin_explicacion_ni_trabajo(
    client_explicable: TestClient,
    guardar_interconsulta: Callable[..., Interconsulta],
) -> None:
    guardar_interconsulta(id="ic-1")

    assert client_explicable.get(URL).json() == {
        "estado": "sin_explicacion",
        "progreso": None,
        "delante": None,
        "error": None,
        "resultado": None,
    }


@pytest.mark.parametrize("metodo", ["get", "post"])
def test_explicacion_de_interconsulta_inexistente(
    client_explicable: TestClient, metodo: str
) -> None:
    respuesta = getattr(client_explicable, metodo)(
        "/api/interconsultas/no-existe/explicacion"
    )
    assert respuesta.status_code == 404


def test_sin_texto_clinico_no_hay_nada_que_explicar(
    client_explicable: TestClient,
    guardar_interconsulta: Callable[..., Interconsulta],
    explicar_controlado: ExplicarControlado,
) -> None:
    guardar_interconsulta(
        id="ic-1",
        historia_clinica="",
        fundamentos_diagnostico="",
        examenes_complementarios="",
        motivo_interconsulta="",
    )

    respuesta = client_explicable.post(URL)

    assert respuesta.status_code == 422
    assert explicar_controlado.llamadas == []


def test_sin_modelo_local_el_endpoint_responde_503(
    client: TestClient,
    guardar_interconsulta: Callable[..., Interconsulta],
) -> None:
    """Con el doble del conftest (sin recursos()), igual que con el servicio
    remoto: no hay modelo con que evaluar las combinaciones, y se dice al tiro
    en vez de encolar algo que va a fallar."""
    guardar_interconsulta(id="ic-1")

    respuesta = client.post(URL)

    assert respuesta.status_code == 503
    assert "MODEL_SERVICE_URL" in respuesta.json()["detail"]
